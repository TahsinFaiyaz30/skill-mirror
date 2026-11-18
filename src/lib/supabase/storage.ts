import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { mockDir } from "@/lib/db";
import { localMock, publicEnv } from "@/lib/config/env";
import { adminSupabase } from "./admin";

export const BUCKETS = [
  "cvs",
  "recordings",
  "artifacts",
  "org-assets",
] as const;
export type Bucket = (typeof BUCKETS)[number];
const globalStorage = globalThis as typeof globalThis & {
  skillMirrorStorageKey?: Buffer;
};
function signingKey() {
  return (globalStorage.skillMirrorStorageKey ??= randomBytes(32));
}
export function localObjectPath(bucket: Bucket, path: string) {
  const root = join(mockDir(), "files", bucket);
  if (
    !path ||
    path
      .split("/")
      .some(
        (part) =>
          !part || !/^[\w.-]+$/.test(part) || part === "." || part === "..",
      )
  )
    throw new Error("Invalid object path");
  const destination = resolve(root, path);
  if (!destination.startsWith(root + sep))
    throw new Error("Invalid object path");
  return destination;
}
function tokenFor(
  bucket: Bucket,
  path: string,
  method: "GET" | "PUT",
  expiry: number,
  upsert = false,
) {
  return createHmac("sha256", signingKey())
    .update(JSON.stringify([method, bucket, path, expiry, upsert]))
    .digest("hex");
}
export function verifyStorageURL(
  bucket: Bucket,
  path: string,
  method: "GET" | "PUT",
  query: URLSearchParams,
) {
  const expires = Number(query.get("expires"));
  const upsert = query.get("upsert") === "1";
  const token = query.get("token");
  if (
    !Number.isSafeInteger(expires) ||
    Date.now() >= expires ||
    !token ||
    !/^[a-f\d]{64}$/.test(token)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(token),
    Buffer.from(tokenFor(bucket, path, method, expires, upsert)),
  );
}
const storagePath = (bucket: Bucket, path: string) =>
  "/api/mock/storage/" +
  bucket +
  "/" +
  path.split("/").map(encodeURIComponent).join("/");
export async function uploadURL(bucket: Bucket, path: string, upsert = false) {
  if (localMock) {
    localObjectPath(bucket, path);
    const expires = Date.now() + 7_200_000;
    const token = tokenFor(bucket, path, "PUT", expires, upsert);
    return {
      path,
      uploadUrl:
        storagePath(bucket, path) +
        "?expires=" +
        expires +
        "&token=" +
        token +
        "&upsert=" +
        Number(upsert),
      token,
    };
  }
  const { data, error } = await adminSupabase()
    .storage.from(bucket)
    .createSignedUploadUrl(path, { upsert });
  if (error) throw error;
  return { path, uploadUrl: data.signedUrl, token: data.token };
}
export async function signedURL(bucket: Bucket, path: string) {
  if (localMock) {
    if (!(await exists(bucket, path))) return null;
    const expires = Date.now() + 3_600_000;
    return (
      storagePath(bucket, path) +
      "?expires=" +
      expires +
      "&token=" +
      tokenFor(bucket, path, "GET", expires)
    );
  }
  const { data } = await adminSupabase()
    .storage.from(bucket)
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
export const publicLogoURL = (path: string | null) =>
  !path
    ? null
    : localMock
      ? storagePath("org-assets", path)
      : publicEnv.supabaseUrl +
        "/storage/v1/object/public/org-assets/" +
        path.split("/").map(encodeURIComponent).join("/");
export async function readObject(
  bucket: Bucket,
  path: string,
): Promise<Buffer | null> {
  if (localMock)
    return readFile(localObjectPath(bucket, path)).catch(
      (error: NodeJS.ErrnoException) =>
        error.code === "ENOENT" ? null : Promise.reject(error),
    );
  const { data } = await adminSupabase().storage.from(bucket).download(path);
  return data ? Buffer.from(await data.arrayBuffer()) : null;
}
export async function putObject(
  bucket: Bucket,
  path: string,
  bytes: Uint8Array,
  contentType: string,
  upsert = true,
) {
  if (localMock) {
    const file = localObjectPath(bucket, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, bytes, { flag: upsert ? "w" : "wx" });
  } else {
    const { error } = await adminSupabase()
      .storage.from(bucket)
      .upload(path, Buffer.from(bytes), { contentType, upsert });
    if (error) throw error;
  }
}
export async function exists(bucket: Bucket, path: string) {
  if (localMock)
    return stat(localObjectPath(bucket, path)).then(
      (value) => value.isFile(),
      () => false,
    );
  const { data } = await adminSupabase().storage.from(bucket).exists(path);
  return Boolean(data);
}
type StoredObject = { path: string; createdAt: Date };
export async function listObjects(
  bucket: Bucket,
  prefix: string,
): Promise<StoredObject[]> {
  const root = prefix.replace(/\/$/, "");
  if (localMock) {
    const folder = localObjectPath(bucket, root);
    const entries = await readdir(folder, { withFileTypes: true }).catch(
      (error: NodeJS.ErrnoException) =>
        error.code === "ENOENT" ? [] : Promise.reject(error),
    );
    return (
      await Promise.all(
        entries.map(async (entry) => {
          const child = root + "/" + entry.name;
          return entry.isDirectory()
            ? listObjects(bucket, child)
            : [
                {
                  path: child,
                  createdAt: (await stat(join(folder, entry.name))).mtime,
                },
              ];
        }),
      )
    ).flat();
  }
  const storage = adminSupabase().storage.from(bucket);
  const found: StoredObject[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(root, {
      limit: 100,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = root + "/" + entry.name;
      if (entry.id)
        found.push({ path, createdAt: new Date(entry.created_at ?? 0) });
      else found.push(...(await listObjects(bucket, path)));
    }
    if (!data || data.length < 100) break;
  }
  return found;
}
export async function removeObjects(bucket: Bucket, paths: string[]) {
  if (localMock) {
    await Promise.all(
      paths.map((path) => rm(localObjectPath(bucket, path), { force: true })),
    );
    return;
  }
  for (let offset = 0; offset < paths.length; offset += 100) {
    const { error } = await adminSupabase()
      .storage.from(bucket)
      .remove(paths.slice(offset, offset + 100));
    if (error) throw error;
  }
}
export async function removePrefix(bucket: Bucket, prefix: string) {
  await removeObjects(
    bucket,
    (await listObjects(bucket, prefix)).map((object) => object.path),
  );
}
