import { toast } from "sonner";
export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function requestJSON<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      error?: { code: string; message: string };
    } | null;
    throw new RequestError(
      response.status,
      data?.error?.code ?? "INTERNAL",
      data?.error?.message ?? "Something went wrong. Please try again.",
    );
  }
  return response.json() as Promise<T>;
}
export const send = <T>(
  path: string,
  method: string,
  data?: unknown,
  signal?: AbortSignal,
) =>
  requestJSON<T>(path, {
    method,
    signal,
    ...(data !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  });
export const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
export const showError = (error: unknown) => toast.error(errorMessage(error));
export const shortTime = (ms: number) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
};
