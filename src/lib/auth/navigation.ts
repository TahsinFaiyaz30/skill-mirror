export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || /^\/[\/\\]/.test(value) || /[\\\u0000-\u001F]/.test(value)) return null;
  try {
    const parsed = new URL(value, "https://skill-mirror.invalid");
    return parsed.origin === "https://skill-mirror.invalid" ? value : null;
  } catch { return null; }
}
export function authPath(path: string, next?: string | null, intent?: string | null) {
  const search = new URLSearchParams();
  const redirect = safeNext(next);
  if (redirect) search.set("next", redirect);
  if (intent === "hiring" || intent === "practice") search.set("intent", intent);
  return search.size ? path + "?" + search.toString() : path;
}
