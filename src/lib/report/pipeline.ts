import { gunzipSync } from "node:zlib";
import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { candidateCvs, competencyResults, events, interviewSessions, reports, softSkillResults, transcriptSegments, turns, type SessionRow, type TurnRow } from "@/lib/db/schema";
import { readObject, putObject, exists } from "@/lib/supabase/storage";
import { evaluateAnswer } from "@/lib/ai/evaluate";
import { attachment, geminiJSON } from "@/lib/ai/gemini";
import { whisper } from "@/lib/ai/groq";
import { p7 } from "@/lib/ai/prompts/p7_tone";
import { p8 } from "@/lib/ai/prompts/p8_narrative";
import { narrativeSchema, toneSchema } from "@/lib/ai/schemas";
import { buildScores } from "@/lib/strategist/scoring";
import { basicItem } from "@/lib/strategist/state";
import { wordsIn, clamp } from "@/lib/utils/math";
import { computeBaseline } from "@/lib/vision/aggregator";
import { defaultCalibration } from "@/lib/vision/features";
import { makeEvent, perTurnEvents } from "@/lib/vision/events";
import { readPitchTrack } from "@/lib/audio/pitch";
import type { MetricSecond, StrategistInput } from "@/types/interview";
import type { MomentCandidate, ReportData, WordTrack } from "@/types/report";
import { alignWords, whisperTimestamps } from "./align";
import { voiceMetrics, vocalEvents } from "./voiceMetrics";
import { nonverbalTurn } from "./nonverbalTurn";
import { stressForTurn } from "./scoring";
import { buildReport } from "./buildReport";
import { fallbackMoment, fallbackNarrative } from "./fallbackTexts";

export const PROCESSING_STEPS = [["verify_media",5],["transcribe",25],["align",35],["rescore",45],["tone",60],["score",70],["narrate",90],["finalize",100]] as const;
const timed = (ms: number) => String(Math.floor(ms/60000)).padStart(2,"0") + ":" + ((ms%60000)/1000).toFixed(1).padStart(4,"0");
const fromTime = (text: string) => { const [minutes,seconds] = text.split(":").map(Number); return Math.round(minutes*60000 + seconds*1000); };
function answerWindow(t: TurnRow) {
  const startMs = t.answerStartMs ?? t.askEndMs, endMs = t.answerEndMs;
  return startMs === null || endMs === null || endMs <= startMs ? null : { startMs, endMs, askStartMs:t.askStartMs ?? startMs, askEndMs:t.askEndMs ?? startMs };
}

export async function processInterview(database: Database, original: SessionRow) {
  const id = original.id;
  const rw = eq(reports.sessionId,id), sw = eq(interviewSessions.id,id), tw = eq(turns.sessionId,id), ew = eq(events.sessionId,id);
  let heartbeat = new Date();
  const [claimed] = await database.update(reports).set({ status:"running",updatedAt:heartbeat,error:null })
    .where(and(rw,ne(reports.status,"completed"),or(ne(reports.status,"running"),sql`${reports.updatedAt} < now() - interval '290 seconds'`))).returning();
  if (!claimed) {
    const [current] = await database.select().from(reports).where(rw);
    return { status:current?.status ?? "running",progress:current?.progress ?? 0,step:current?.step ?? "verify_media",busy:current?.status !== "completed" };
  }
  await database.update(interviewSessions).set({ status:"processing",error:null }).where(sw);
  const done = [...claimed.stepsDone], prefix = original.userId + "/" + id;
  const file = prefix + "/words.json";
  const loadTurnRows = () => database.select().from(turns).where(tw).orderBy(asc(turns.idx));
  const loadEvents = () => database.select().from(events).where(ew).orderBy(asc(events.startMs));
  const loadSession = async () => (await database.select().from(interviewSessions).where(sw))[0];
  const off = original.config.evaluation.nonverbalPolicy === "off";
  const fileBytes = async (file: { path:string } | undefined, bucket: "artifacts"|"recordings" = "artifacts") => file
    ? readObject(bucket,file.path).catch(() => null) : null;
  const rawTimeline = async (): Promise<MetricSecond[]> => {
    try { const bytes = await fileBytes(original.media.timeline); return bytes ? JSON.parse(gunzipSync(bytes).toString()).seconds ?? [] : []; }
    catch { return []; }
  };
  const loadPitch = async () => {
    try { const bytes = await fileBytes(original.media.pitch); return bytes ? readPitchTrack(gunzipSync(bytes)) : []; }
    catch { return []; }
  };
  const loadTrack = async (): Promise<WordTrack|null> => {
    try { const bytes = await readObject("artifacts",file); return bytes ? JSON.parse(bytes.toString()) : null; }
    catch { return null; }
  };
  async function scoreData() {
    const [s, turnRows, eventRows, timeline, pitch, track, segments] = await Promise.all([
      loadSession(),loadTurnRows(),loadEvents(),rawTimeline(),loadPitch(),loadTrack(),
      database.select().from(transcriptSegments).where(eq(transcriptSegments.sessionId,id)).orderBy(asc(transcriptSegments.startMs)),
    ]);
    const zero = turnRows.find((t) => t.idx === 0);
    const baseline = s.baseline ?? computeBaseline(timeline,eventRows,s.calibration ?? defaultCalibration,zero?.answerStartMs ?? null,zero?.answerEndMs ?? null);
    return buildReport(s,turnRows,baseline,timeline,pitch,eventRows,track,segments);
  }
  const steps: Record<(typeof PROCESSING_STEPS)[number][0],()=>Promise<void>> = {
    verify_media: async () => {
      const check = (file: {path:string} | undefined,bucket: "artifacts"|"recordings") => file ? exists(bucket,file.path).catch(() => false) : Promise.resolve(false);
      const [hasMic,hasTimeline,hasPitch,hasLandmarks,...segments] = await Promise.all([
        check(original.media.micAudio,"recordings"),check(original.media.timeline,"artifacts"),check(original.media.pitch,"artifacts"),check(original.media.landmarks,"artifacts"),
        ...(original.media.videoSegments ?? []).map((segment) => check(segment,"recordings")),
      ]);
      if (!hasMic || !hasTimeline || !hasPitch || !hasLandmarks || segments.some((ok) => !ok)) {
        console.info("SkillMirror report has incomplete media", { hasMic,hasTimeline,hasPitch,hasLandmarks,segmentsOk:segments.every(Boolean) });
      }
    },
    transcribe: async () => {
      if (original.aiMode === "mock" || await loadTrack()) return;
      const [mic,timeline,cv] = await Promise.all([
        fileBytes(original.media.micAudio,"recordings"),rawTimeline(),
        original.cvId ? database.select({ parsed:candidateCvs.parsed }).from(candidateCvs).where(eq(candidateCvs.id,original.cvId)) : [],
      ]);
      if (!mic || mic.length > 24*1024*1024) return;
      const hint = ("Umm, let me think like, hmm... Okay, here's what I'm, like, thinking. " + (cv[0]?.parsed?.skills ?? []).slice(0,8).map((s) => s.name).join(", ")).slice(0,220);
      let track: WordTrack | null = null;
      for (let i = 0;i < 2;i++) {
        try {
          const response = await whisper(mic,"mic.webm",hint,true) as Awaited<ReturnType<typeof whisper>> &
            { words?: Parameters<typeof whisperTimestamps>[0]; segments?: Parameters<typeof whisperTimestamps>[1] };
          track = whisperTimestamps(response.words ?? [],response.segments ?? [],original.media.micAudio?.startOffsetMs ?? 0,timeline);
          break;
        } catch { /* The report can use the interview transcript if transcription fails. */ }
      }
      if (track) await putObject("artifacts",file,Buffer.from(JSON.stringify(track)),"application/json");
    },
    align: async () => {
      const [track,items,pitch,timeline,prior] = await Promise.all([loadTrack(),loadTurnRows(),loadPitch(),rawTimeline(),loadEvents()]);
      const aligned = track ? alignWords(items,track) : null;
      const zero = items.find((turn) => turn.idx === 0);
      const baseline = computeBaseline(timeline,prior,original.calibration ?? defaultCalibration,zero?.answerStartMs ?? null,zero?.answerEndMs ?? null);
      const metrics = items.map((turn) => {
        const text = aligned?.get(turn.idx), window = answerWindow(turn);
        const voice = text?.words.length && window && !off ? voiceMetrics(text.words,text.segments,pitch,{ ...window,kind:turn.itemKind }) : null;
        return { turn,text,window,voice };
      });
      const calibrationVoice = metrics.find(({turn}) => turn.idx === 0)?.voice;
      if (calibrationVoice) {
        baseline.fields.wpm = calibrationVoice.wpm ?? baseline.fields.wpm;
        baseline.fields.fillerPerMin = calibrationVoice.fillerPerMin ?? baseline.fields.fillerPerMin;
        baseline.fields.hedgePerMin = calibrationVoice.hedgePerMin ?? baseline.fields.hedgePerMin;
      }
      await database.transaction(async (tx) => {
        await tx.update(interviewSessions).set({ baseline }).where(sw);
        await tx.delete(events).where(and(ew,eq(events.category,"vocal")));
        if (aligned) await tx.delete(transcriptSegments).where(and(eq(transcriptSegments.sessionId,id),eq(transcriptSegments.speaker,"candidate")));
        for (const entry of metrics) {
          const { turn,text,window,voice } = entry;
          const transcript = text?.words.map((word) => word.w).join(" ") || turn.answerTranscriptLive;
          await tx.update(turns).set({ answerTranscriptFinal:transcript,finalMetrics:{ voice,vision:null } }).where(and(tw,eq(turns.idx,turn.idx)));
          if (aligned && window && transcript?.trim()) {
            const inside = text?.segments.length ? text.segments : [{ text:transcript,s:window.startMs,e:window.endMs }];
            await tx.insert(transcriptSegments).values(inside.map((part) => ({ sessionId:id,speaker:"candidate" as const,source:"whisper" as const,turnIdx:turn.idx,text:part.text,startMs:part.s,endMs:part.e })));
          }
          if (voice && window && text) {
            const derived = vocalEvents(text.words,pitch,voice,baseline.fields,{ ...window,turnIdx:turn.idx,kind:turn.itemKind });
            if (derived.length) await tx.insert(events).values(derived.map((event) => ({ ...event,sessionId:id })));
          }
        }
      });
    },
    rescore: async () => {
      const state = original.strategistState;
      if (!state) return;
      const items = (await loadTurnRows()).filter((t) => t.scores && (t.scores.scoringFailed ||
        wordsIn(t.answerTranscriptFinal ?? "") > 0 && wordsIn(t.answerTranscriptFinal ?? "") >= 1.3 * wordsIn(t.answerTranscriptLive ?? "")));
      for (let offset = 0; offset < items.length; offset += 4) await Promise.all(items.slice(offset,offset+4).map(async (turn) => {
        const item = { ...basicItem(turn.itemKind,turn.phase,turn.questionText),source:turn.questionSource,competencyKey:turn.competencyKey,level:turn.difficulty,isFollowUp:turn.isFollowUp,
          idealPoints:(turn.strategistOutput?.idealPoints ?? []) as string[], redFlags:(turn.strategistOutput?.redFlags ?? []) as string[], lookFor:(turn.strategistOutput?.lookFor ?? []) as string[] };
        const timings = { askStartMs:turn.askStartMs ?? 0,askEndMs:turn.askEndMs ?? 0,answerStartMs:turn.answerStartMs,answerEndMs:turn.answerEndMs ?? 0 };
        const input: StrategistInput = { event:"answer_end",directiveSeq:0,turnIdx:turn.idx,answerStatus:turn.answerStatus ?? "complete",
          transcript:turn.answerTranscriptFinal ?? turn.answerTranscriptLive ?? "",metrics:turn.liveMetrics,timings,elapsedMs:timings.answerEndMs };
        const result = await evaluateAnswer(original,state,input,item,true);
        if (!result) return;
        const scores = buildScores(turn.itemKind,result.output,result.source,original.config.ai.strictness,{ mockTotal:result.mockTotal,interrupt:Boolean(state.presentation.interruptChallenge) });
        await database.update(turns).set({ scores,scoreTotal:scores.total }).where(and(tw,eq(turns.idx,turn.idx)));
      }));
    },
    tone: async () => {
      if (off || original.aiMode === "mock") return;
      const [mic,turnRows] = await Promise.all([fileBytes(original.media.micAudio,"recordings"),loadTurnRows()]);
      if (!mic) return;
      const windows = turnRows.flatMap((t) => { const w = answerWindow(t); return w && w.endMs - w.startMs >= 5000 ? [{ turnIdx:t.idx,kind:t.itemKind,start:timed(w.startMs),end:timed(w.endMs),question:t.questionText }] : []; });
      if (!windows.length) return;
      try {
        const { turns: results } = await geminiJSON(p7({ turnWindowsJson:JSON.stringify(windows) }),toneSchema,{ temperature:.2,inline:attachment("audio","audio/webm",mic) });
        await database.transaction(async (tx) => {
          await tx.delete(events).where(and(ew,eq(events.type,"tone_moment")));
          for (const tone of results) {
            const turn = turnRows.find((t) => t.idx === tone.turnIdx);
            const window = turn && answerWindow(turn);
            if (!window) continue;
            await tx.update(turns).set({ tone }).where(and(tw,eq(turns.idx,tone.turnIdx)));
            const positive = ["confident","composed","enthusiastic"].includes(tone.label);
            for (const moment of tone.moments) {
              const at = clamp(fromTime(moment.at),window.startMs,window.endMs);
              await tx.insert(events).values({ ...makeEvent(positive ? "positive" : "vocal","tone_moment",at,at,.4,tone.turnIdx,{ note:moment.note }),sessionId:id });
            }
          }
        });
      } catch { /* Tone is optional when the provider cannot read the recording. */ }
    },
    score: async () => {
      const [s,turnRows,all,timeline] = await Promise.all([loadSession(),loadTurnRows(),loadEvents(),rawTimeline()]);
      if (!s.baseline) throw new Error("Missing baseline");
      const b = s.baseline.fields;
      const types = ["excessive_blinking","flat_affect","steady_eye_contact"];
      await database.transaction(async (tx) => {
        await tx.delete(events).where(and(ew,inArray(events.type,types)));
        for (const turn of turnRows) {
          const window = answerWindow(turn);
          if (!window) continue;
          const vision = nonverbalTurn(timeline,all,{ ...window,answerStartMs:window.startMs,answerEndMs:window.endMs },s.config.evaluation.nonverbalPolicy);
          const metrics = { voice:off ? null : turn.finalMetrics?.voice ?? null,vision };
          const stress = off ? null : stressForTurn(metrics,b,turn.itemKind,window.endMs-window.startMs);
          await tx.update(turns).set({ finalMetrics:{ ...metrics,stress,composure:stress === null ? null : Math.round(100*(1-stress)) } }).where(and(tw,eq(turns.idx,turn.idx)));
          if (!off) {
            const full = vision as import("@/types/interview").VisionSummary;
            const generated = perTurnEvents(full,b,window.startMs,window.endMs,turn.idx);
            if (generated.length) await tx.insert(events).values(generated.map((event) => ({ ...event,sessionId:id })));
          }
        }
      });
      const { report } = await scoreData();
      await database.update(reports).set({ data:report }).where(rw);
    },
    narrate: async () => {
      const [{ report,candidates },turnRows] = await Promise.all([scoreData(),loadTurnRows()]);
      const fallback = fallbackNarrative(report,candidates,turnRows);
      let data = fallback;
      if (original.aiMode !== "mock") {
        try { data = await narrative(original,report,candidates,turnRows,fallback); }
        catch { /* The report still contains computed scores and coaching templates. */ }
      }
      await database.update(reports).set({ data }).where(rw);
    },
    finalize: async () => {},
  };
  try {
    for (const [key,progress] of PROCESSING_STEPS) {
      if (done.includes(key)) continue;
      const [lease] = await database.update(reports).set({ step:key }).where(and(rw,eq(reports.updatedAt,heartbeat))).returning({ id:reports.sessionId });
      if (!lease) return { status:"running",progress,step:key,busy:true };
      await steps[key]();
      done.push(key);
      const next = new Date();
      if (key === "finalize") {
        await database.transaction(async (tx) => {
          const [saved] = await tx.select().from(reports).where(and(rw,eq(reports.updatedAt,heartbeat))).for("update");
          if (!saved?.data) throw new Error("Missing report data");
          const data = saved.data;
          await tx.update(reports).set({ status:"completed",stepsDone:[...done],progress,step:key,updatedAt:next,completedAt:next,overallScore:data.headline.overallScore,
            verdict:data.headline.verdict ?? data.headline.recommendation }).where(rw);
          if (original.kind === "practice") {
            await tx.delete(competencyResults).where(eq(competencyResults.sessionId,id));
            await tx.delete(softSkillResults).where(eq(softSkillResults.sessionId,id));
            if (data.technical.competencies.length) await tx.insert(competencyResults).values(data.technical.competencies.map((c) => ({
              sessionId:id,userId:original.userId,competencyKey:c.key,subLabel:c.subLabel,ceiling:c.ceiling,bracketed:c.bracketed,theta:c.theta,score:c.score,
            })));
            const measured = data.softSkills.dimensions.filter((d) => d.score !== null && d.level !== null);
            if (measured.length) await tx.insert(softSkillResults).values(measured.map((d) => ({ sessionId:id,userId:original.userId,dimension:d.key,score:d.score!,level:d.level! })));
          }
          await tx.update(interviewSessions).set({ status:"completed",error:null }).where(sw);
        });
      } else await database.update(reports).set({ stepsDone:[...done],progress,updatedAt:next }).where(and(rw,eq(reports.updatedAt,heartbeat)));
      heartbeat = next;
    }
    return { status:"completed",progress:100,step:"finalize",busy:false };
  } catch (error) {
    console.error("SkillMirror processing failed",{ type:error instanceof Error ? error.name : "unknown" });
    const message = "We couldn't finish building your report. Please try again.";
    await database.transaction(async (tx) => {
      const [updated] = await tx.update(reports).set({ status:"failed",error:message,updatedAt:new Date() }).where(and(rw,eq(reports.updatedAt,heartbeat))).returning();
      if (updated) await tx.update(interviewSessions).set({ status:"failed",error:message }).where(sw);
    });
    const [current] = await database.select().from(reports).where(rw);
    return { status:current?.status ?? "failed",progress:current?.progress ?? 0,step:current?.step ?? "verify_media",busy:false };
  }
}

async function narrative(session: SessionRow, report: ReportData, candidates: MomentCandidate[], turnRows: TurnRow[], fallback: ReportData): Promise<ReportData> {
  const { headline,technical,softSkills,composure,stats,session:reportSession } = report;
  const values = await geminiJSON(p8({
    company:session.company,seniority:session.seniority,roleTitle:session.roleTitle,practice:session.kind === "practice",companyBlock:session.kind !== "practice",
    candidateFirstName:"the candidate",computedResultsJson:JSON.stringify({ headline,technical,softSkills,composure,stats,nonverbalPolicy:reportSession.nonverbalPolicy }),
    aiInstructionsOrNone:session.config.ai.instructions || "None",turnsJson:JSON.stringify(report.turns.map((t) => ({ ...t,transcript:t.transcript.slice(0,1500) }))),
    candidatesJson:JSON.stringify(candidates),
  }),narrativeSchema,{ thinking:"medium",temperature:.4,timeout:90000 });
  const byId = new Map(candidates.map((c) => [c.id,c]));
  const chosen = new Set<string>();
  const keyMoments = values.key_moments.flatMap((item) => {
    const candidate = byId.get(item.candidate_id);
    if (!candidate || chosen.has(candidate.id)) return [];
    chosen.add(candidate.id);
    return [{ ...fallbackMoment(candidate),title:item.title,sentiment:item.sentiment,whatHappened:item.what_happened,whyItMatters:item.why_it_matters,
      howToFix:item.how_to_fix,betterAnswer:candidate.kind === "answer" ? item.better_answer || null : null }];
  });
  for (const moment of [...candidates].sort((a,b) => b.severity-a.severity)) {
    if (keyMoments.length >= 5) break;
    if (!chosen.has(moment.id)) keyMoments.push(fallbackMoment(moment));
  }
  return {
    ...fallback,headline:{ ...headline,summary:values.summary },keyMoments,
    summaryLists:{ strengths:values.summary_lists.strengths,growthAreas:values.summary_lists.growth_areas },
    technical:{ ...technical,competencies:technical.competencies.map((t) => ({ ...t,commentary:values.technical_commentary.find((c) => c.key === t.key)?.text ?? "" })) },
    softSkills:{ ...softSkills,dimensions:softSkills.dimensions.map((d) => ({ ...d,commentary:values.soft_skill_commentary.find((c) => c.key === d.key)?.text ?? "" })) },
    composure:composure ? { ...composure,commentary:values.composure_commentary } : null,
    turns:report.turns.map((t) => {
      const row = values.turn_feedback.find((x) => x.turnIdx === t.turnIdx);
      const source = turnRows.find((x) => x.idx === t.turnIdx);
      return { ...t,feedback:row?.feedback ?? source?.scores?.gaps[0] ?? "",idealOutline:row?.ideal_outline ?? [] };
    }),
    practicePlan:values.practice_plan.map((item) => ({ title:item.title,why:item.why,drill:item.drill,targetMetric:item.target_metric })),
  };
}
