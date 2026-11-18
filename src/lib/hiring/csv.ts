export type Cell = string | number | boolean | null | undefined;
export function csvCell(value: Cell) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return /[",\r\n\t]/.test(safe)
    ? '"' + safe.replaceAll('"', '""') + '"'
    : safe;
}
export function encodeCSV(rows: Cell[][]) {
  return (
    "\uFEFF" +
    rows.map((row) => row.map(csvCell).join(",")).join("\r\n") +
    "\r\n"
  );
}
export function parseCandidateCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"' && quoted && source[i + 1] === '"') {
      cell += '"';
      i++;
      continue;
    }
    if (c === '"') {
      quoted = !quoted;
      continue;
    }
    if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && source[i + 1] === "\n") i++;
      rows.push([...row, cell]);
      row = [];
      cell = "";
      continue;
    }
    cell += c;
  }
  if (row.length || cell) rows.push([...row, cell]);
  return rows
    .filter(
      ([email]) => email?.trim() && email.trim().toLowerCase() !== "email",
    )
    .map(([email, name]) => ({
      email: email.trim(),
      name: name?.trim() || undefined,
    }));
}
