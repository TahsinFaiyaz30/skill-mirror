import type { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function initializeMockDatabase(engine: PGlite) {
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
    GRANT USAGE ON SCHEMA auth, storage TO authenticated, anon;
    GRANT SELECT ON storage.objects TO authenticated, anon;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE IF NOT EXISTS auth.skill_mirror_migrations (name text PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS auth.skill_mirror_sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
  `);
  const migrationDir = join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(migrationDir))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const result = await engine.query(
      "SELECT 1 FROM auth.skill_mirror_migrations WHERE name = $1",
      [file],
    );
    if (result.rows.length) continue;
    const migration = await readFile(join(migrationDir, file), "utf8");
    await engine.transaction(async (tx) => {
      await tx.exec(migration);
      await tx.query(
        "INSERT INTO auth.skill_mirror_migrations(name) VALUES ($1)",
        [file],
      );
    });
  }
}
