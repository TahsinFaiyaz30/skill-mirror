import { randomUUID } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { authIdentity } from "@/lib/db/authSchema";
import { initializeMockDatabase } from "@/lib/db/mockSetup";
import * as schema from "@/lib/db/schema";
import { deleteAccount } from "@/lib/api/account";
import { startSession, strategist } from "@/lib/api/live";
import { patchMediaRoute, telemetry } from "@/lib/api/media";
import { addMember } from "@/lib/api/organization";
import { statusRoute } from "@/lib/api/reports";
import { REPORT_LEASE_MS } from "@/lib/config/constants";
import { defaultOpeningConfig } from "@/lib/config/sessionConfig";
import { processInterview } from "@/lib/report/pipeline";
import { compose } from "@/lib/strategist/compose";
import { startInterview } from "@/lib/strategist/engine";
import { basicItem, type InterviewContext } from "@/lib/strategist/state";
import type { StrategistInput } from "@/types/interview";
import { goldenFixture } from "../fixtures/session-01/fixture";

const services = vi.hoisted(() => ({
  database: undefined as unknown as Database,
  userId: "",
  removePrefix: vi.fn(),
  readObject: vi.fn(),
  evaluateAnswer: vi.fn(),
  interruptChallenge: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: async () => services.database }));
vi.mock("@/lib/config/env", async (original) => ({
  ...(await original<typeof import("@/lib/config/env")>()),
  localMock: true,
}));
vi.mock("@/lib/auth/mock", () => ({
  mockUser: async () => ({
    id: services.userId,
    email: "member@example.test",
    provider: "email",
  }),
}));
vi.mock("@/lib/supabase/storage", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/storage")>()),
  removePrefix: services.removePrefix,
  readObject: services.readObject,
}));
vi.mock("@/lib/ai/evaluate", () => ({
  evaluateAnswer: services.evaluateAnswer,
  interruptChallenge: services.interruptChallenge,
}));

let pg: PGlite;
let database: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  pg = await PGlite.create({ extensions: { citext } });
  await initializeMockDatabase(pg);
  database = drizzle(pg, { schema });
  services.database = database as unknown as Database;
}, 30_000);
afterAll(async () => {
  if (pg) await pg.close();
});
beforeEach(() => {
  services.removePrefix.mockReset().mockResolvedValue(undefined);
  services.readObject.mockReset().mockResolvedValue(null);
  services.evaluateAnswer.mockReset();
  services.interruptChallenge.mockReset();
});
afterEach(() => vi.restoreAllMocks());

const request = (data?: unknown, method = "POST") =>
  new Request("http://localhost/api/test", {
    method,
    ...(data !== undefined && {
      body: JSON.stringify(data),
      headers: { "content-type": "application/json" },
    }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function user(fields: Partial<typeof authIdentity.$inferInsert> = {}) {
  const id = randomUUID();
  await database.insert(authIdentity).values({
    id,
    email: id + "@example.test",
    emailConfirmedAt: new Date(),
    ...fields,
  });
  return id;
}
async function ownedOrganization() {
  const owner = await user();
  const orgId = randomUUID();
  await database.insert(schema.organizations).values({
    id: orgId,
    name: "Northstar",
    slug: "northstar-" + orgId,
    logoPath: orgId + "/logo.png",
    createdBy: owner,
  });
  await database
    .insert(schema.orgMembers)
    .values({ orgId, userId: owner, role: "owner" });
  services.userId = owner;
  return { owner, orgId };
}
function freshSession(
  userId: string,
  overrides: Partial<schema.SessionRow> = {},
): schema.SessionRow {
  const session = {
    ...goldenFixture("off").session,
    userId,
    id: randomUUID(),
    orgId: null,
    openingId: null,
    invitationId: null,
    ...overrides,
  };
  return {
    ...session,
    organizationRemoved: session.kind !== "practice" && session.orgId === null,
  };
}

describe("account and interview API writes", () => {
  it("adds confirmed active accounts and rejects unconfirmed or deleted accounts", async () => {
    const { orgId } = await ownedOrganization();
    const pending = "pending-" + orgId + "@example.test";
    const deleted = "deleted-" + orgId + "@example.test";
    const confirmed = "confirmed-" + orgId + "@example.test";
    await user({ email: pending, emailConfirmedAt: null });
    await user({ email: deleted, deletedAt: new Date() });
    const active = await user({ email: confirmed });
    for (const email of [pending, deleted]) {
      expect(
        (await addMember(request({ email, role: "recruiter" }))).status,
      ).toBe(400);
    }
    expect(
      (await addMember(request({ email: confirmed, role: "recruiter" })))
        .status,
    ).toBe(200);
    expect(
      await database
        .select()
        .from(schema.orgMembers)
        .where(eq(schema.orgMembers.userId, active)),
    ).toMatchObject([{ orgId, userId: active, role: "recruiter" }]);
  });

  it("leaves the last owner's rows and Storage untouched when the organization still has members", async () => {
    const { owner, orgId } = await ownedOrganization();
    const recruiter = await user();
    await database
      .insert(schema.orgMembers)
      .values({ orgId, userId: recruiter, role: "recruiter" });
    expect((await deleteAccount(request())).status).toBe(409);
    expect(services.removePrefix).not.toHaveBeenCalled();
    expect(
      await database
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, owner)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(schema.pendingAccountDeletions)
        .where(eq(schema.pendingAccountDeletions.userId, owner)),
    ).toHaveLength(0);
  });

  it("commits sole-owner deletion first and retries logo cleanup without deleting the candidate's report", async () => {
    const { owner, orgId } = await ownedOrganization();
    const candidate = await user();
    const session = freshSession(candidate, {
      orgId,
      openingId: randomUUID(),
      status: "completed",
    });
    await database.insert(schema.openings).values({
      id: session.openingId!,
      orgId,
      title: "Engineer",
      roleTitle: "Engineer",
      seniority: "mid",
      roleFamily: "software_engineering",
      config: defaultOpeningConfig,
      status: "active",
      locked: true,
    });
    await database.insert(schema.interviewSessions).values(session);
    await database
      .insert(schema.reports)
      .values({ sessionId: session.id, status: "completed" });
    await database.insert(schema.invitations).values({
      orgId,
      openingId: session.openingId!,
      email: "prospect@example.test",
      token: randomUUID(),
      status: "pending",
      expiresAt: new Date(Date.now() + 30_000),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    services.removePrefix.mockImplementation(async (bucket: string) => {
      if (bucket === "org-assets") throw new Error("Storage offline");
    });
    expect((await deleteAccount(request())).status).toBe(500);
    expect(
      await database
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.id, owner)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(schema.organizations)
        .where(eq(schema.organizations.id, orgId)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.orgId, orgId)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(authIdentity)
        .where(eq(authIdentity.id, owner)),
    ).toHaveLength(1);
    expect(
      await database
        .select()
        .from(schema.interviewSessions)
        .where(eq(schema.interviewSessions.id, session.id)),
    ).toMatchObject([{ userId: candidate, orgId: null, openingId: null }]);
    expect(
      await database
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.sessionId, session.id)),
    ).toHaveLength(1);
    const [pending] = await database
      .select()
      .from(schema.pendingAccountDeletions)
      .where(eq(schema.pendingAccountDeletions.userId, owner));
    expect(pending.orgId).toBe(orgId);

    services.removePrefix.mockReset().mockResolvedValue(undefined);
    expect((await deleteAccount(request())).status).toBe(200);
    expect(services.removePrefix).toHaveBeenCalledWith("org-assets", orgId);
    expect(
      await database
        .select()
        .from(authIdentity)
        .where(eq(authIdentity.id, owner)),
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(schema.pendingAccountDeletions)
        .where(eq(schema.pendingAccountDeletions.userId, owner)),
    ).toHaveLength(0);
  });

  it.each(["completed", "discarded", "superseded"] as const)(
    "rejects media and telemetry writes to a %s interview",
    async (status) => {
      services.userId = await user();
      const session = freshSession(services.userId, { status });
      await database.insert(schema.interviewSessions).values(session);
      const context = params(session.id);
      expect(
        (
          await patchMediaRoute(
            request({ snapshotsCount: 1 }, "PATCH"),
            context,
          )
        ).status,
      ).toBe(409);
      expect(
        (
          await telemetry(
            request({
              transcripts: [
                {
                  speaker: "candidate",
                  text: "An interview answer",
                  startMs: 100,
                  endMs: 1000,
                  turnIdx: 0,
                },
              ],
            }),
            context,
          )
        ).status,
      ).toBe(409);
      expect(
        await database
          .select()
          .from(schema.interviewSessions)
          .where(eq(schema.interviewSessions.id, session.id)),
      ).toMatchObject([{ media: {} }]);
      expect(
        await database
          .select()
          .from(schema.transcriptSegments)
          .where(eq(schema.transcriptSegments.sessionId, session.id)),
      ).toHaveLength(0);
    },
  );

  it("still accepts queued uploads and telemetry while processing", async () => {
    services.userId = await user();
    const session = freshSession(services.userId, { status: "processing" });
    await database.insert(schema.interviewSessions).values(session);
    expect(
      (
        await patchMediaRoute(
          request({ snapshotsCount: 1 }, "PATCH"),
          params(session.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (await telemetry(request({ transcripts: [] }), params(session.id)))
        .status,
    ).toBe(200);
  });

  it("prevents a previously accepted candidate from starting after the organization is removed", async () => {
    services.userId = await user();
    const session = freshSession(services.userId, { status: "ready" });
    await database.insert(schema.interviewSessions).values(session);
    const response = await startSession(
      request({ t0EpochMs: Date.now() }),
      params(session.id),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { message: "This opening is no longer accepting interviews." },
    });
  });
});

describe("report processing", () => {
  it("preserves live answer text and speaker segments for turns with no aligned Whisper words", async () => {
    const { turns, words } = goldenFixture("off");
    services.userId = await user();
    const session = freshSession(services.userId);
    await database.insert(schema.interviewSessions).values(session);
    const missed = turns[0];
    const missingSegment = turns[1];
    const aligned = turns[2];
    await database.insert(schema.turns).values(
      turns.map((turn) => ({
        ...turn,
        id: randomUUID(),
        sessionId: session.id,
      })),
    );
    const segment = {
      sessionId: session.id,
      speaker: "candidate" as const,
      source: "live" as const,
      turnIdx: missed.idx,
      startMs: missed.answerStartMs!,
      endMs: missed.answerEndMs!,
      text: missed.answerTranscriptLive!,
    };
    const [original] = await database
      .insert(schema.transcriptSegments)
      .values(segment)
      .returning();
    await database.insert(schema.reports).values({
      sessionId: session.id,
      status: "queued",
      stepsDone: ["verify_media", "transcribe", "rescore", "tone"],
    });
    services.readObject.mockImplementation(async (_bucket, path: string) =>
      path.endsWith("/words.json") ? Buffer.from(JSON.stringify(words)) : null,
    );
    const result = await processInterview(services.database, session);
    expect(result.status).toBe("completed");
    const stored = await database
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.sessionId, session.id));
    expect(
      stored.find((turn) => turn.idx === missed.idx)?.answerTranscriptFinal,
    ).toBe(missed.answerTranscriptLive);
    expect(
      stored.find((turn) => turn.idx === aligned.idx)?.answerTranscriptFinal,
    ).toBe("system throughput latency");
    const transcript = await database
      .select()
      .from(schema.transcriptSegments)
      .where(eq(schema.transcriptSegments.sessionId, session.id));
    expect(transcript).toContainEqual(original);
    expect(transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          turnIdx: missingSegment.idx,
          source: "live",
          text: missingSegment.answerTranscriptLive,
        }),
        expect.objectContaining({ turnIdx: aligned.idx, source: "whisper" }),
      ]),
    );
  });

  it("advertises a retry only after the report lease expires", async () => {
    services.userId = await user();
    const session = freshSession(services.userId, { status: "processing" });
    await database.insert(schema.interviewSessions).values(session);
    await database.insert(schema.reports).values({
      sessionId: session.id,
      status: "running",
      updatedAt: new Date(),
    });
    const getStatus = () =>
      statusRoute(request(undefined, "GET"), params(session.id)).then((resp) =>
        resp.json(),
      );
    expect((await getStatus()).retryAfterMs).toBeGreaterThan(0);
    await database
      .update(schema.reports)
      .set({ updatedAt: new Date(Date.now() - REPORT_LEASE_MS - 1000) })
      .where(eq(schema.reports.sessionId, session.id));
    expect((await getStatus()).retryAfterMs).toBe(0);
  });
});

describe("strategist concurrency and recovery", () => {
  async function started() {
    services.userId = await user();
    const session = freshSession(services.userId, { status: "in_progress" });
    const interview: InterviewContext = {
      config: session.config,
      plan: session.plan!,
      firstName: "Jamie",
      company: session.company,
      roleTitle: session.roleTitle,
    };
    return { session, interview, state: startInterview(interview) };
  }
  function answer(
    state: ReturnType<typeof startInterview>,
    overrides: Partial<StrategistInput> = {},
  ) {
    return request({
      event: "answer_end",
      answerStatus: "complete",
      directiveSeq: state.lastDirective.seq,
      turnIdx: state.turnIdx,
      transcript:
        "I would measure the response time before changing the design.",
      timings: {
        askStartMs: 0,
        askEndMs: 1000,
        answerStartMs: 1100,
        answerEndMs: 3000,
      },
      metrics: null,
      elapsedMs: 3000,
      ...overrides,
    } satisfies StrategistInput);
  }

  it("leaves the database available during evaluation and returns a concurrently saved directive", async () => {
    const { session, state } = await started();
    await database
      .insert(schema.interviewSessions)
      .values({ ...session, strategistState: state });
    const evaluating = Promise.withResolvers<void>();
    const evaluation = Promise.withResolvers<undefined>();
    services.evaluateAnswer.mockImplementation(() => {
      evaluating.resolve();
      return evaluation.promise;
    });
    const response = strategist(answer(state), params(session.id));
    await evaluating.promise;
    const latest = {
      ...state.lastDirective,
      seq: state.lastDirective.seq + 1,
      sayText: "Next question",
    };
    const updated = database
      .update(schema.interviewSessions)
      .set({ strategistState: { ...state, lastDirective: latest } })
      .where(eq(schema.interviewSessions.id, session.id))
      .then(() => true);
    const deadline = Promise.withResolvers<false>();
    const timer = setTimeout(() => deadline.resolve(false), 1000);
    let available;
    try {
      available = await Promise.race([updated, deadline.promise]);
    } finally {
      clearTimeout(timer);
      evaluation.resolve(undefined);
    }
    expect(await (await response).json()).toEqual({ directive: latest });
    expect(available).toBe(true);
  });

  it("writes a consistent recovery directive after a prep transition fails", async () => {
    const { session, state, interview } = await started();
    state.current = basicItem("presentation", "presentation");
    state.lastDirective = compose(interview, state.current, {
      seq: 4,
      turnIdx: state.turnIdx,
    });
    await database
      .insert(schema.interviewSessions)
      .values({ ...session, strategistState: state });
    vi.spyOn(database, "transaction").mockRejectedValueOnce(
      new Error("Transaction interrupted"),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await strategist(
      answer(state, { event: "presentation_prep_done" }),
      params(session.id),
    );
    const { directive } = await response.json();
    expect(directive).toMatchObject({
      mode: "ask",
      expectAnswer: true,
      endInterview: false,
      presentation: null,
      seq: 5,
    });
    const [saved] = await database
      .select()
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.id, session.id));
    expect(saved.strategistState?.lastDirective).toEqual(directive);
  });
});
