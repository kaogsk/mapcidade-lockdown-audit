/** Coerce an unknown DB cell to a display string. Avoids "[object Object]". */
export function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") {
    return String(v);
  }
  return JSON.stringify(v);
}

/** null-safe string for report lines (never "undefined"). */
export function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "(none)";
  if (typeof v === "boolean") return v ? "true" : "false";
  return toStr(v);
}

/** Quoted representation for names/urls in report lines. */
export function quoted(v: unknown): string {
  if (v === null || v === undefined) return "(none)";
  return `"${toStr(v)}"`;
}
