import { localMock, publicEnv } from "@/lib/config/env";

export function teamPhotoURL(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  if (localMock || !publicEnv.supabaseUrl) {
    return "/api/mock/storage/org-assets/" + encoded;
  }
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/org-assets/${encoded}`;
}

export function memberInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "SM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Center-crops and resizes any uploaded portrait image to a uniform 400x400
 * square so all Team cards render with identical aspect ratio, crispness, and
 * fast load times.
 */
export async function resizeTeamAvatar(
  file: File,
  size = 400,
): Promise<{ blob: Blob; ext: "webp" | "jpg"; contentType: string }> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable.");

    const side = Math.min(bitmap.width, bitmap.height);
    const sx = Math.max(0, Math.floor((bitmap.width - side) / 2));
    const sy = Math.max(0, Math.floor((bitmap.height - side) / 3)); // slight top bias for portraits
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (webp && webp.type === "image/webp") {
      return { blob: webp, ext: "webp", contentType: "image/webp" };
    }
    const jpeg = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!jpeg) throw new Error("Could not encode resized portrait.");
    return { blob: jpeg, ext: "jpg", contentType: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}
