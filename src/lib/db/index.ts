import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { drizzle as embeddedDrizzle } from "drizzle-orm/pglite";
import { drizzle as postgresDrizzle } from "drizzle-orm/postgres-js";
import type {
  PgDatabase,
  PgQueryResultHKT,
  PgTransaction,
} from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import postgres from "postgres";
import { localMock, serverEnv } from "@/lib/config/env";
import * as schema from "./schema";
import { initializeMockDatabase } from "./mockSetup";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Transaction = PgTransaction<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
export function mockDir() {
  const subdirectory = (process.env.SKILL_MIRROR_MOCK_DIR ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.skill-mirror\/?/, "");
  if (
    subdirectory &&
    subdirectory.split("/").some((part) => !/^[\w-]+$/.test(part))
  ) {
    throw new Error("The mock data directory must be inside .skill-mirror.");
  }
  return resolve(
    /*turbopackIgnore: true*/ process.cwd(),
    ".skill-mirror",
    subdirectory,
  );
}

async function embeddedDatabase(): Promise<Database> {
  const [{ PGlite }, { citext }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/contrib/citext"),
  ]);
  const directory = mockDir();
  await mkdir(directory, { recursive: true });
  const engine = await PGlite.create(join(directory, "pg"), {
    extensions: { citext },
  });
  await initializeMockDatabase(engine);
  return embeddedDrizzle(engine, { schema }) as unknown as Database;
}

const globalDatabase = globalThis as typeof globalThis & {
  skillMirrorDatabase?: Promise<Database>;
};
export function db(): Promise<Database> {
  if (!globalDatabase.skillMirrorDatabase) {
    const connecting = localMock
      ? embeddedDatabase()
      : Promise.resolve().then(() => {
          const url = serverEnv().DATABASE_URL;
          if (!url)
            throw new Error(
              "DATABASE_URL is required outside local mock mode.",
            );
          return postgresDrizzle(postgres(url, { prepare: false }), {
            schema,
          }) as unknown as Database;
        });
    globalDatabase.skillMirrorDatabase = connecting.catch((error: unknown) => {
      delete globalDatabase.skillMirrorDatabase;
      throw error;
    });
  }
  return globalDatabase.skillMirrorDatabase;
}
