/**
 * Logging redaction. Server logs may contain only categories and codes:
 * never images (data URLs / base64), tokens, API keys, signed URLs, emails or
 * clinical notes. Use safeLog() instead of console.* in server code.
 */
const PATTERNS: [RegExp, string][] = [
  [/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[image]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [token]"],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, "[jwt]"],
  [/\b(sk|rk|appl|goog|AIza)[_A-Za-z0-9-]{16,}\b/g, "[secret]"],
  [/[?&](token|signature|sig|key|X-Amz-Signature|access_token|code)=[^&\s]+/gi, "?$1=[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/[A-Za-z0-9+/]{400,}={0,2}/g, "[base64]"],
];

export function redact(value: string): string {
  return PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value).slice(0, 500);
}

type LogValue = string | number | boolean | null | undefined;

/** Structured, redacted server log. Only primitive fields; strings are redacted. */
export function safeLog(level: "error" | "warn" | "info", event: string, fields: Record<string, LogValue> = {}): void {
  const clean: Record<string, LogValue> = {};
  for (const [key, value] of Object.entries(fields)) clean[key] = typeof value === "string" ? redact(value) : value;
  console[level](`[smilecompose] ${event}`, clean);
}
