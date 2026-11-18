import { readFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { drizzle as embeddedDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import postgres from "postgres";
import { localMock, serverEnv } from "@/lib/config/env";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export const mockDir = () => resolve(process.env.SKILL_MIRROR_MOCK_DIR || ".skill-mirror");

async function embeddedDatabase(): Promise<Database> {
  const [{ PGlite }, { citext }] = await Promise.all([import("@electric-sql/pglite"), import("@electric-sql/pglite/contrib/citext")]);
  const directory = mockDir();
  await mkdir(directory, { recursive: true });
  const engine = await PGlite.create(join(directory, "pg"), { extensions: { citext } });
  await engine.exec(`
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE SCHEMA IF NOT EXISTS storage;
    DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY, email text, encrypted_password text, email_confirmed_at timestamptz, raw_user_meta_data jsonb
    );
    CREATE UNIQUE INDEX IF NOT EXISTS auth_email_unique ON auth.users (lower(email));
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint);
    CREATE TABLE IF NOT EXISTS storage.objects (bucket_id text, name text);
    CREATE OR REPLACE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
      $$ SELECT string_to_array($1, '/') $$;
    CREATE TABLE IF NOT EXISTS auth.skill_mirror_migrations (name text PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS auth.skill_mirror_sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
  `);
  const migrationDir = join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(migrationDir)).filter((name) => name.endsWith(".sql")).sort();
  for (const file of files) {
    const result = await engine.query("SELECT 1 FROM auth.skill_mirror_migrations WHERE name = $1", [file]);
    if (result.rows.length) continue;
    const migration = await readFile(join(migrationDir, file), "utf8");
    await engine.transaction(async (tx) => {
      await tx.exec(migration);
      await tx.query("INSERT INTO auth.skill_mirror_migrations(name) VALUES ($1)", [file]);
    });
  }
  return embeddedDrizzle(engine, { schema }) as unknown as Database;
}

const globalDatabase = globalThis as typeof globalThis & { skillMirrorDatabase?: Promise<Database> };
export function db(): Promise<Database> {
  if (!globalDatabase.skillMirrorDatabase) {
    const connecting = localMock ? embeddedDatabase() : Promise.resolve().then(() => {
      const url = serverEnv().DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is required outside local mock mode.");
      return postgresDrizzle(postgres(url, { prepare: false }), { schema }) as unknown as Database;
    });
    globalDatabase.skillMirrorDatabase = connecting.catch((error: unknown) => {
      delete globalDatabase.skillMirrorDatabase;
      throw error;
    });
  }
  return globalDatabase.skillMirrorDatabase;
}
