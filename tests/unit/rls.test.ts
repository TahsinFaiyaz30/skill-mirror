import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { citext } from "@electric-sql/pglite/contrib/citext";
import { initializeMockDatabase } from "@/lib/db/mockSetup";

const owner = "10000000-0000-4000-8000-000000000001";
const candidate = "10000000-0000-4000-8000-000000000002";
const outsider = "10000000-0000-4000-8000-000000000003";
const org = "20000000-0000-4000-8000-000000000001";
const opening = "30000000-0000-4000-8000-000000000001";
const company = "40000000-0000-4000-8000-000000000001";
const practice = "40000000-0000-4000-8000-000000000002";
let pg: PGlite;
beforeAll(async () => {
  pg = await PGlite.create({ extensions: { citext } });
  await initializeMockDatabase(pg);
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [candidate, "candidate@example.test"],
    [outsider, "outsider@example.test"],
  ])
    await pg.query(
      'INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES ($1,$2,\'{"full_name":"Fixture user"}\')',
      [id, email],
    );
  await pg.query(
    "INSERT INTO organizations(id,name,slug,created_by) VALUES ($1,'Northstar','northstar',$2)",
    [org, owner],
  );
  await pg.query(
    "INSERT INTO org_members(org_id,user_id,role) VALUES ($1,$2,'owner')",
    [org, owner],
  );
  await pg.query(
    "INSERT INTO openings(id,org_id,title,role_title,role_family,seniority,config,locked) VALUES ($1,$2,'Backend','Backend','software_engineering','mid','{}',true)",
    [opening, org],
  );
  await pg.query(
    "INSERT INTO interview_sessions(id,user_id,kind,org_id,opening_id,company,role_title,role_family,seniority,length_minutes,voice_name,ai_mode,config,plan) VALUES ($1,$2,'company',$3,$4,'Northstar','Backend','software_engineering','mid',20,'Kore','mock','{}','{}')",
    [company, candidate, org, opening],
  );
  await pg.query(
    "INSERT INTO interview_sessions(id,user_id,company,role_title,role_family,seniority,length_minutes,voice_name,ai_mode,config) VALUES ($1,$2,'Northstar','Backend','software_engineering','mid',10,'Kore','mock','{}')",
    [practice, candidate],
  );
  await pg.query(
    "INSERT INTO reports(session_id,status) VALUES ($1,'completed'),($2,'completed')",
    [company, practice],
  );
  await pg.query(
    "INSERT INTO storage.objects(bucket_id,name) VALUES ('recordings',$1),('recordings',$2)",
    [
      candidate + "/" + company + "/video/seg-000.webm",
      candidate + "/" + practice + "/video/seg-000.webm",
    ],
  );
}, 30000);
afterAll(async () => {
  if (pg) await pg.close();
});
const asUser = (id: string, query: string, params: unknown[] = []) =>
  pg.transaction(async (tx) => {
    await tx.exec("SET LOCAL ROLE authenticated");
    await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [id]);
    return tx.query(query, params);
  });
describe("Postgres row level security", () => {
  it("restricts CV storage path writes to server-managed uploads", async () => {
    const result = await asUser(
      candidate,
      "SELECT has_table_privilege('candidate_cvs','SELECT') AS readable, has_column_privilege('candidate_cvs','storage_path','UPDATE') AS writable, has_column_privilege('candidate_cvs','storage_path','INSERT') AS insertable",
    );
    expect(result.rows).toEqual([
      { readable: true, writable: false, insertable: false },
    ]);
  });
  it("creates each profile and grants users access to their own profile only", async () => {
    const result = await asUser(candidate, "SELECT id FROM profiles");
    expect(result.rows).toEqual([{ id: candidate }]);
    await expect(
      asUser(candidate, "UPDATE profiles SET intent='hiring' WHERE id=$1", [
        candidate,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
  it("allows practice results and denies the company report to its candidate", async () => {
    expect(
      (await asUser(candidate, "SELECT session_id FROM reports")).rows,
    ).toEqual([{ session_id: practice }]);
    expect(
      (await asUser(owner, "SELECT session_id FROM reports")).rows,
    ).toEqual([{ session_id: company }]);
    expect(
      (await asUser(outsider, "SELECT session_id FROM reports")).rows,
    ).toEqual([]);
  });
  it("permits own session status while hiding plans, config and strategist state", async () => {
    expect(
      (
        await asUser(
          candidate,
          "SELECT id,status FROM interview_sessions WHERE id=$1",
          [company],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await asUser(
          outsider,
          "SELECT id,status FROM interview_sessions WHERE id=$1",
          [company],
        )
      ).rows,
    ).toEqual([]);
    for (const column of ["plan", "config", "strategist_state"])
      await expect(
        asUser(
          candidate,
          "SELECT " + column + " FROM interview_sessions WHERE id=$1",
          [company],
        ),
      ).rejects.toThrow(/permission denied/i);
  });
  it("applies candidate playback visibility to direct storage reads", async () => {
    const result = await asUser(candidate, "SELECT name FROM storage.objects");
    expect(result.rows).toEqual([
      { name: candidate + "/" + practice + "/video/seg-000.webm" },
    ]);
    expect(
      (await asUser(outsider, "SELECT name FROM storage.objects")).rows,
    ).toEqual([]);
  });
  it("restricts organization rows and rejects edits to a locked interview design", async () => {
    expect((await asUser(outsider, "SELECT id FROM openings")).rows).toEqual(
      [],
    );
    expect((await asUser(owner, "SELECT id FROM openings")).rows).toEqual([
      { id: opening },
    ]);
    await expect(
      asUser(
        owner,
        "UPDATE openings SET config='{\"changed\":true}' WHERE id=$1",
        [opening],
      ),
    ).rejects.toThrow(/locked/);
    await expect(
      asUser(owner, "DELETE FROM openings WHERE id=$1", [opening]),
    ).rejects.toThrow(/Close the opening/);
  });
});
