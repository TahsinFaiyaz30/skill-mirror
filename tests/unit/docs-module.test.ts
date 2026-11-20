import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULE_END,
  DEFAULT_SCHEDULE_START,
  docsDocumentSchema,
  docsSettingsPatchSchema,
  evaluateDocsAccess,
} from "@/lib/docs/access";
import {
  createDefaultDocsDocument,
  DEFAULT_ARCHITECTURE_MERMAID,
  DEFAULT_DATA_FLOW_MERMAID,
} from "@/lib/docs/defaults";
import { parseMermaidFlowchart } from "@/lib/docs/diagram";
import { exportDocsMarkdown } from "@/lib/docs/markdown";
import type { LiveDocsTelemetry } from "@/types/docs";

describe("docs access control & scheduling", () => {
  const base = {
    scheduleStart: DEFAULT_SCHEDULE_START,
    scheduleEnd: DEFAULT_SCHEDULE_END,
    durationStartedAt: null,
    durationHours: 72,
  };

  it("blocks public access when mode is OFF", () => {
    const decision = evaluateDocsAccess({ ...base, visibilityMode: "off" });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("disabled");
  });

  it("allows public access anytime when mode is ON", () => {
    const decision = evaluateDocsAccess(
      { ...base, visibilityMode: "on" },
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("always_on");
  });

  it("enforces default June 10 (00:00) to June 14 (23:59) scheduled window", () => {
    const before = evaluateDocsAccess(
      { ...base, visibilityMode: "scheduled" },
      new Date("2026-06-09T23:59:59Z"),
    );
    expect(before.allowed).toBe(false);
    expect(before.reason).toBe("outside_schedule");

    const inside = evaluateDocsAccess(
      { ...base, visibilityMode: "scheduled" },
      new Date("2026-06-12T12:00:00Z"),
    );
    expect(inside.allowed).toBe(true);
    expect(inside.reason).toBe("within_schedule");

    const after = evaluateDocsAccess(
      { ...base, visibilityMode: "scheduled" },
      new Date("2026-06-15T00:00:01Z"),
    );
    expect(after.allowed).toBe(false);
    expect(after.reason).toBe("outside_schedule");
  });

  it("enforces duration-based publishing windows and expiry", () => {
    const started = "2026-11-20T10:00:00.000Z";
    const active = evaluateDocsAccess(
      {
        ...base,
        visibilityMode: "duration",
        durationStartedAt: started,
        durationHours: 24,
      },
      new Date("2026-11-21T09:59:00.000Z"),
    );
    expect(active.allowed).toBe(true);
    expect(active.reason).toBe("within_duration");

    const expired = evaluateDocsAccess(
      {
        ...base,
        visibilityMode: "duration",
        durationStartedAt: started,
        durationHours: 24,
      },
      new Date("2026-11-21T10:01:00.000Z"),
    );
    expect(expired.allowed).toBe(false);
    expect(expired.reason).toBe("duration_expired");
  });

  it("validates default document and rejects inverted schedule windows", () => {
    const doc = createDefaultDocsDocument();
    expect(docsDocumentSchema.safeParse(doc).success).toBe(true);
    expect(doc.sections.map((s) => s.code)).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
    ]);
    expect(doc.teamMembers.length).toBeGreaterThanOrEqual(3);

    const badSchedule = docsSettingsPatchSchema.safeParse({
      visibilityMode: "scheduled",
      scheduleStart: "2026-06-15T00:00:00.000Z",
      scheduleEnd: "2026-06-10T00:00:00.000Z",
    });
    expect(badSchedule.success).toBe(false);
  });
});

describe("mermaid diagram parser & markdown exporter", () => {
  it("parses default architecture and data-flow diagrams cleanly", () => {
    const arch = parseMermaidFlowchart(DEFAULT_ARCHITECTURE_MERMAID);
    expect(arch.direction).toBe("LR");
    expect(arch.nodes.length).toBeGreaterThanOrEqual(6);
    expect(arch.edges.length).toBeGreaterThanOrEqual(6);

    const flow = parseMermaidFlowchart(DEFAULT_DATA_FLOW_MERMAID);
    expect(flow.nodes.map((n) => n.id)).toEqual([
      "IN",
      "PROC",
      "AI",
      "OUT",
      "FB",
    ]);
  });

  it("exports markdown containing live counts, pitch deck, team, and APIs", () => {
    const doc = createDefaultDocsDocument();
    const live: LiveDocsTelemetry = {
      syncedAt: "2026-11-20T16:00:00.000Z",
      environment: {
        appUrl: "http://localhost:3000",
        aiMode: "live",
        dataTier: "unpaid",
        retentionDays: 30,
        maxPracticePerDay: 50,
        maxCompanyPerDayPerOrg: 200,
        githubEnrichmentEnabled: false,
        emailConfigured: false,
      },
      counts: {
        users: 6,
        practiceUsers: 3,
        hiringUsers: 3,
        organizations: 3,
        openings: 4,
        activeOpenings: 2,
        invitations: 5,
        sessions: 12,
        completedSessions: 9,
        practiceSessions: 8,
        companySessions: 4,
        turns: 45,
        reports: 9,
        completedReports: 9,
        averageScore: 78,
        cvs: 7,
        parsedCvs: 7,
        certificates: 3,
        events: 340,
      },
      eventsByCategory: [{ category: "nonverbal", count: 180 }],
      sessionsByDay: [{ day: "2026-11-20", practice: 4, company: 2, total: 6 }],
      providers: {
        geminiKeyCount: 4,
        groqKeyCount: 1,
        activeCooldowns: 0,
        flashModels: ["gemini-4-hydrogen"],
        liveModels: ["gemini-3.8-live-extended-thinking"],
        transcribeLiveModel: "gemini-3.5-transcribe-live",
        ttsModels: ["gemini-3.8-flash-tts"],
        groqStrategistModels: ["openai/gpt-oss-120b"],
        groqWhisperModels: ["whisper-large-v3-turbo"],
      },
      apiEndpointsCount: 60,
    };

    const md = exportDocsMarkdown(doc, live, {
      publishedVersion: 2,
      publishedAt: "2026-11-20T16:00:00.000Z",
    });
    expect(md).toContain("v2");
    expect(md).toContain("6 users");
    expect(md).toContain("Tahsin Faiyaz");
    expect(md).toContain("MD. Shahed Khan");
    expect(md).toContain("/api/docs");
    expect(md).toContain("```mermaid");
  });
});
