import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import { deleteAccount, retention } from "@/lib/api/account";
import { startSession, strategist } from "@/lib/api/live";
import { mediaUpload, patchMediaRoute, telemetry } from "@/lib/api/media";
import { previewOpening } from "@/lib/api/opening";
import { SEGMENTS_PER_CAPTURE } from "@/lib/recording/captures";
import { addMember } from "@/lib/api/organization";
import { createSession, getSession, planSession } from "@/lib/api/session";
import { statusRoute } from "@/lib/api/reports";
import { certificateBySlug, createCertificate } from "@/lib/api/practice";
import { REPORT_LEASE_MS } from "@/lib/config/constants";
import { publicEnv } from "@/lib/config/env";
import {
  buildSessionConfig,
  defaultOpeningConfig,
} from "@/lib/config/sessionConfig";
import { processInterview } from "@/lib/report/pipeline";
import { buildReport } from "@/lib/report/buildReport";
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
  mockUser: async () =>
    services.userId
      ? {
          id: services.userId,
          email: "member@example.test",
          provider: "email",
        }
      : null,
}));
vi.mock("@/lib/supabase/storage", async (original) => ({
  ...(await original<typeof import("@/lib/supabase/storage")>()),
  removePrefix: services.removePrefix,
  removeObjects: vi.fn(async () => {}),
  listObjects: vi.fn(async () => []),
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
  it("prepares a 3:30 judge practice session using the configured AI engine and an owned sample CV", async () => {
    const input = {
      company: "Example Company",
      roleTitle: "Backend Engineer",
      roleFamily: "software_engineering",
      seniority: "mid",
      lengthMinutes: 3.5,
      voiceName: "Kore",
    };
    services.userId = "";
    expect(
      (await createSession(request({ ...input, judgeMode: true }))).status,
    ).toBe(401);

    services.userId = await user();
    expect((await createSession(request(input))).status).toBe(400);
    const response = await createSession(
      request({ ...input, judgeMode: true }),
    );
    expect(response.status).toBe(201);
    const { sessionId } = await response.json();
    const [session] = await database
      .select()
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.id, sessionId));
    expect(session).toMatchObject({
      kind: "practice",
      userId: services.userId,
      lengthMinutes: 2,
      aiMode: publicEnv.aiMode,
      config: { judgeMode: true, lengthMinutes: 3.5, hardCapMs: 210_000 },
    });
    expect(session.cvId).toBeTruthy();
    const [cv] = await database
      .select()
      .from(schema.candidateCvs)
      .where(eq(schema.candidateCvs.id, session.cvId!));
    expect(cv).toMatchObject({
      userId: services.userId,
      parseStatus: "parsed",
      parsed: { headline: "Software engineer building reliable services" },
    });

    services.userId = await user();
    expect((await planSession(request(), params(sessionId))).status).toBe(404);
    services.userId = session.userId;
    expect((await planSession(request(), params(sessionId))).status).toBe(200);

    const standard = await createSession(
      request({ ...input, lengthMinutes: 10, cvId: cv.id }),
    );
    expect(standard.status).toBe(201);
    const standardId = (await standard.json()).sessionId;
    const [regular] = await database
      .select()
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.id, standardId));
    expect(regular).toMatchObject({
      aiMode: publicEnv.aiMode,
      lengthMinutes: 10,
    });
    expect(regular.config.judgeMode).not.toBe(true);

    const quick = await createSession(request({ ...input, cvId: cv.id }));
    expect(quick.status).toBe(201);
    const quickId = (await quick.json()).sessionId;
    const quickSession = await getSession(request(undefined, "GET"), params(quickId));
    expect(await quickSession.json()).toMatchObject({
      session: { lengthMinutes: 3.5, aiMode: publicEnv.aiMode },
      config: { hardCapMs: 210_000 },
    });
  });

  it("runs a judge preview with the opening's authored questions and keeps hiring data intact", async () => {
    const { owner, orgId } = await ownedOrganization();
    const [opening] = await database
      .insert(schema.openings)
      .values({
        orgId,
        title: "Backend Engineer",
        roleTitle: "Backend Engineer",
        seniority: "mid",
        roleFamily: "software_engineering",
        config: defaultOpeningConfig,
        status: "active",
        locked: true,
      })
      .returning();
    const [question] = await database
      .insert(schema.openingQuestions)
      .values({
        openingId: opening.id,
        orderIdx: 0,
        phase: "technical",
        text: "How would you prevent jobs from running twice?",
        competencyKey: "backend_apis",
        difficulty: 2,
        idealPoints: ["Idempotency keys", "Deduplication", "Safe retries"],
        redFlags: ["No retry strategy"],
        expectedMinutes: 1,
        origin: "manual",
      })
      .returning();
    const [invite] = await database
      .insert(schema.invitations)
      .values({
        openingId: opening.id,
        orgId,
        email: "candidate@example.test",
        token: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        createdBy: owner,
      })
      .returning();

    services.userId = await user();
    expect(
      (await previewOpening(request({ judgeMode: true }), params(opening.id)))
        .status,
    ).toBe(404);
    services.userId = owner;
    const response = await previewOpening(
      request({ judgeMode: true }),
      params(opening.id),
    );
    expect(response.status).toBe(200);
    const { sessionId } = await response.json();
    const [preview] = await database
      .select()
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.id, sessionId));
    expect(preview).toMatchObject({
      kind: "preview",
      userId: owner,
      orgId,
      openingId: opening.id,
      invitationId: null,
      roleTitle: opening.roleTitle,
      lengthMinutes: 2,
      aiMode: publicEnv.aiMode,
      config: {
        judgeMode: true,
        lengthMinutes: 3.5,
        hardCapMs: 210_000,
        customQuestions: [{ id: question.id, text: question.text }],
      },
    });
    expect((await planSession(request(), params(sessionId))).status).toBe(200);
    expect(
      await database
        .select()
        .from(schema.openings)
        .where(eq(schema.openings.id, opening.id)),
    ).toEqual([opening]);
    expect(
      await database
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.openingId, opening.id)),
    ).toEqual([invite]);
  });

  it("joins an active preparation and recovers a stale one", async () => {
    services.userId = await user();
    const config = buildSessionConfig("practice", {
      lengthMinutes: 10,
      voiceName: "Kore",
    });
    const active = freshSession(services.userId, {
      kind: "practice",
      lengthMinutes: 10,
      status: "planning",
      plan: null,
      startedAt: null,
      endedAt: null,
      lastActiveAt: new Date(),
      config: { ...config, cvRequired: false },
    });
    await database.insert(schema.interviewSessions).values(active);

    const waiting = await planSession(request(), params(active.id));
    expect(waiting.status).toBe(202);
    expect(await waiting.json()).toEqual({ planSummary: null });

    await database
      .update(schema.interviewSessions)
      .set({ lastActiveAt: new Date(0) })
      .where(eq(schema.interviewSessions.id, active.id));
    const recovered = await planSession(request(), params(active.id));
    expect(recovered.status).toBe(200);
    const ready = await recovered.json();
    expect(ready.planSummary.interviewerName).toBeTruthy();
    const reloaded = await planSession(request(), params(active.id));
    expect(await reloaded.json()).toEqual(ready);
  });

  it("expires abandoned media without deleting a fresh or never-started recording", async () => {
    services.userId = await user();
    const old = new Date(Date.now() - 35 * 86400000);
    const stale = freshSession(services.userId, {
      status: "discarded",
      startedAt: old,
      lastActiveAt: old,
      endedAt: null,
    });
    const fresh = freshSession(services.userId, {
      status: "in_progress",
      startedAt: old,
      lastActiveAt: new Date(),
      endedAt: null,
    });
    const draft = freshSession(services.userId, {
      status: "ready",
      startedAt: null,
      endedAt: null,
      createdAt: old,
    });
    await database
      .insert(schema.interviewSessions)
      .values([stale, fresh, draft]);
    vi.stubEnv("CRON_SECRET", "test-retention");
    try {
      const response = await retention(
        new Request("http://localhost/api/test", {
          headers: { authorization: "Bearer test-retention" },
        }),
      );
      expect(response.status).toBe(200);
      for (const [session, expired] of [
        [stale, true],
        [fresh, false],
        [draft, false],
      ] as const) {
        const [row] = await database
          .select()
          .from(schema.interviewSessions)
          .where(eq(schema.interviewSessions.id, session.id));
        expect(Boolean(row.media.deleted)).toBe(expired);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("enforces the Off policy for signed uploads, metadata and telemetry", async () => {
    services.userId = await user();
    const session = freshSession(services.userId, { status: "in_progress" });
    await database.insert(schema.interviewSessions).values(session);
    const ctx = params(session.id);
    for (const kind of ["pitch", "landmarks", "timeline", "snapshot"])
      expect((await mediaUpload(request({ kind }), ctx)).status).toBe(403);
    const prefix = session.userId + "/" + session.id;
    expect(
      (
        await patchMediaRoute(
          request(
            { pitch: { path: prefix + "/pitch.bin.gz", bytes: 4 } },
            "PATCH",
          ),
          ctx,
        )
      ).status,
    ).toBe(403);
    const event = {
      id: randomUUID(),
      category: "integrity",
      type: "multiple_faces",
      startMs: 0,
      endMs: 500,
      severity: 0.9,
      turnIdx: 0,
      snapshotPath: null,
      data: { note: "discard" },
    };
    await telemetry(
      request({
        events: [
          event,
          { ...event, id: randomUUID(), category: "nonverbal", type: "slouch" },
        ],
      }),
      ctx,
    );
    const saved = await database
      .select()
      .from(schema.events)
      .where(eq(schema.events.sessionId, session.id));
    expect(saved.map((e) => [e.type, e.data])).toEqual([
      ["multiple_faces", {}],
    ]);
  });
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
  it("preserves recognized CVs and clears unverifiable cached parses in the migration", async () => {
    const owner = await user();
    const real = randomUUID(),
      sample = randomUUID(),
      unknown = randomUUID();
    for (const [id, path] of [
      [real, owner + "/" + real + ".pdf"],
      [sample, owner + "/sample.pdf"],
      [unknown, owner + "/old-upload.pdf"],
    ]) {
      await pg.query(
        "INSERT INTO candidate_cvs(id,user_id,storage_path,file_name,parsed,parse_status) VALUES ($1,$2,$3,'fixture.pdf',$4::jsonb,'parsed')",
        [id, owner, path, JSON.stringify({ headline: "fixture" })],
      );
    }
    await pg.exec(
      await readFile(
        "supabase/migrations/0006_protect_interview_evidence.sql",
        "utf8",
      ),
    );
    const rows = (
      await pg.query<{
        id: string;
        parse_status: string;
        parsed: unknown;
        storage_path: string;
      }>(
        "SELECT id,parse_status,parsed,storage_path FROM candidate_cvs WHERE user_id=$1",
        [owner],
      )
    ).rows;
    expect(
      rows
        .filter((cv) => cv.parse_status === "parsed")
        .map((cv) => cv.id)
        .sort(),
    ).toEqual([real, sample].sort());
    expect(rows.find((cv) => cv.id === unknown)).toMatchObject({
      parsed: null,
      storage_path: owner + "/" + unknown + ".pdf",
      parse_status: "failed",
    });
  });
  it("repairs legacy certificate eligibility and removes stored Off measurements during migration", async () => {
    const userId = await user();
    const fixture = goldenFixture("scored");
    const failed = freshSession(userId, {
      kind: "practice",
      status: "completed",
      config: fixture.session.config,
    });
    const off = freshSession(userId, {
      baseline: fixture.baseline,
      media: { timeline: { path: "old-timeline", bytes: 24 } },
    });
    await database.insert(schema.interviewSessions).values([failed, off]);
    const technical = fixture.turns.find((t) => t.itemKind === "technical")!;
    await database.insert(schema.turns).values({
      ...technical,
      id: randomUUID(),
      sessionId: failed.id,
      scores: { ...technical.scores!, scoringFailed: true },
    });
    await pg.query(
      "INSERT INTO reports(session_id,status,data) VALUES ($1,'completed',$2::jsonb),($3,'completed',$4::jsonb)",
      [
        failed.id,
        JSON.stringify({ eligibility: { certificate: true } }),
        off.id,
        JSON.stringify({ baseline: fixture.baseline }),
      ],
    );
    const slug = randomUUID().slice(0, 12);
    await pg.query(
      "INSERT INTO certificates(slug,session_id,user_id,payload,signature) VALUES ($1,$2,$3,'{}','fixture')",
      [slug, failed.id, userId],
    );
    await pg.exec(
      await readFile(
        "supabase/migrations/0006_protect_interview_evidence.sql",
        "utf8",
      ),
    );
    expect(
      (await pg.query("SELECT revoked FROM certificates WHERE slug=$1", [slug]))
        .rows,
    ).toEqual([{ revoked: true }]);
    expect(
      (
        await pg.query("SELECT status FROM reports WHERE session_id=$1", [
          failed.id,
        ])
      ).rows,
    ).toEqual([{ status: "queued" }]);
    expect(
      (
        await pg.query(
          "SELECT baseline,media FROM interview_sessions WHERE id=$1",
          [off.id],
        )
      ).rows,
    ).toEqual([{ baseline: null, media: { purgeDelivery: true } }]);
    expect(
      (await pg.query("SELECT data FROM reports WHERE session_id=$1", [off.id]))
        .rows,
    ).toEqual([{ data: { baseline: null } }]);
  });
  it("updates a signed certificate at the same URL when a mixed evaluation is recalculated", async () => {
    vi.stubEnv("CERT_SIGNING_SECRET", "synthetic-certificate-regression-key");
    try {
      services.userId = await user();
      const fixture = goldenFixture("scored");
      const session = freshSession(services.userId, {
        kind: "practice",
        status: "completed",
        config: { ...fixture.session.config, kind: "practice" },
        baseline: fixture.baseline,
      });
      const rows = fixture.turns.map((turn) => ({
        ...turn,
        id: randomUUID(),
        sessionId: session.id,
      }));
      const technical = rows.find((turn) => turn.itemKind === "technical")!;
      rows.push({
        ...technical,
        id: randomUUID(),
        idx: rows.length,
        scores: { ...technical.scores!, scoringFailed: true },
      });
      const old = buildReport(
        session,
        rows,
        fixture.baseline,
        [],
        [],
        [],
        null,
        [],
      ).report;
      old.headline.overallScore = 1;
      await database.insert(schema.interviewSessions).values(session);
      await database.insert(schema.turns).values(rows);
      await database
        .insert(schema.reports)
        .values({ sessionId: session.id, status: "completed", data: old });
      const issue = () => createCertificate(request(), params(session.id));
      const response = await issue();
      expect(response.status).toBe(200);
      const { slug } = await response.json();
      const original = await certificateBySlug(slug);
      expect(original).toMatchObject({
        valid: true,
        revoked: false,
        payload: { overallScore: 1 },
      });

      await pg.exec(
        await readFile(
          "supabase/migrations/0006_protect_interview_evidence.sql",
          "utf8",
        ),
      );
      expect((await certificateBySlug(slug))?.revoked).toBe(true);
      expect((await processInterview(services.database, session)).status).toBe(
        "completed",
      );
      const [report] = await database
        .select()
        .from(schema.reports)
        .where(eq(schema.reports.sessionId, session.id));
      expect(report.overallScore).toBeGreaterThan(1);
      expect(await certificateBySlug(slug)).toMatchObject({
        valid: true,
        revoked: false,
        payload: {
          certId: slug,
          issuedAt: original!.payload.issuedAt,
          overallScore: report.overallScore,
        },
      });
      await database
        .update(schema.certificates)
        .set({ revoked: true })
        .where(eq(schema.certificates.slug, slug));
      expect((await issue()).status).toBe(409);
    } finally {
      vi.unstubAllEnvs();
    }
  });
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
  it("reserves a stable media range per page and keeps both microphone archives", async () => {
    const { session, state } = await started();
    const originalId = randomUUID(),
      newId = randomUUID();
    await database.insert(schema.interviewSessions).values({
      ...session,
      strategistState: state,
      media: { captureIds: [originalId] },
    });
    const ctx = params(session.id);
    for (const [captureId, index] of [
      [originalId, 0],
      [newId, 1],
      [newId, 1],
    ] as const) {
      const result = await startSession(
        request({ t0EpochMs: Date.now(), captureId }),
        ctx,
      );
      expect(await result.json()).toMatchObject({ captureIndex: index });
    }
    for (const index of [0, 1]) {
      const start = index * 120000;
      const prefix = session.userId + "/" + session.id;
      const media = {
        captureIndex: index,
        micAudio: {
          path: prefix + (index ? "/captures/1" : "") + "/audio/mic.webm",
          durationMs: start + 1000,
          startOffsetMs: start,
          bytes: 50,
        },
        videoSegments: [
          {
            index: index * SEGMENTS_PER_CAPTURE,
            path:
              prefix +
              "/video/seg-" +
              String(index * SEGMENTS_PER_CAPTURE).padStart(3, "0") +
              ".webm",
            startMs: start,
            endMs: start + 1000,
            bytes: 80,
            uploaded: true,
          },
        ],
      };
      expect((await patchMediaRoute(request(media, "PATCH"), ctx)).status).toBe(
        200,
      );
    }
    const [row] = await database
      .select()
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.id, session.id));
    expect(row.media.videoSegments?.map((s) => s.index)).toEqual([
      0,
      SEGMENTS_PER_CAPTURE,
    ]);
    expect(row.media.micAudio?.startOffsetMs).toBe(0);
    expect(row.media.additionalCaptures?.[1].micAudio?.startOffsetMs).toBe(
      120000,
    );
  });
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
