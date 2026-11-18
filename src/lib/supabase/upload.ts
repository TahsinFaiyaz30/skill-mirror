"use client";
import { localMock } from "@/lib/config/env";
import { browserSupabase } from "./client";
export type SignedUpload = { path: string; uploadUrl: string; token: string };
export async function uploadFile(bucket: string, signed: SignedUpload, file: Blob, contentType: string) {
  if (localMock) {
    const response = await fetch(signed.uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
    if (!response.ok) throw new Error("Could not upload the file. Try again.");
    return;
  }
  const { error } = await browserSupabase().storage.from(bucket).uploadToSignedUrl(signed.path, signed.token, file, { contentType });
  if (error) throw new Error(error.message);
}
