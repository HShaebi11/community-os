export type ParsedWhatsAppMessage = {
  sourceMessageId: string;
  authorRaw: string;
  body: string;
  sentAt: string;
  attachedNames: string[];
};

const LINE =
  /^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)\]?\s*(?:-\s*)?([^:]+):\s([\s\S]*)$/i;

const SYSTEM_AUTHORS = new Set(["system", "whatsapp"]);

export function parseWhatsAppTranscript(text: string): ParsedWhatsAppMessage[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const messages: ParsedWhatsAppMessage[] = [];

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    const match = LINE.exec(line);
    if (!match) {
      const last = messages.at(-1);
      if (last) last.body = `${last.body}\n${line}`.trim();
      continue;
    }
    const [, date, time, author, body] = match;
    const authorRaw = author.trim();
    if (SYSTEM_AUTHORS.has(authorRaw.toLowerCase())) continue;
    const sentAt = parseWhatsAppDate(date, time);
    const attachedNames = [...body.matchAll(/<attached:\s*([^>]+)>/gi)].map((m) => m[1].trim());
    const sourceMessageId = `${sentAt}|${authorRaw}|${hashShort(body)}`;
    messages.push({
      sourceMessageId,
      authorRaw,
      body: body.trim(),
      sentAt,
      attachedNames,
    });
  }
  return messages;
}

function parseWhatsAppDate(date: string, time: string): string {
  const parts = date.split(/[\/.-]/).map((p) => Number(p));
  let day = parts[0];
  let month = parts[1];
  let year = parts[2];
  if (year < 100) year += 2000;
  if (day > 12 && month <= 12) {
    // already D/M/Y
  } else if (month > 12) {
    const tmp = day;
    day = month;
    month = tmp;
  }
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  const ampm = time.match(/AM|PM/i)?.[0];
  const clock = time.replace(/\s*(AM|PM)/i, "");
  const [h, m, s] = clock.split(":").map((n) => Number(n));
  hours = h;
  /* v8 ignore next -- the LINE regex requires `hh:mm`, so `m` is always defined */
  minutes = m ?? 0;
  seconds = s ?? 0;
  if (ampm) {
    const upper = ampm.toUpperCase();
    if (upper === "PM" && hours < 12) hours += 12;
    if (upper === "AM" && hours === 12) hours = 0;
  }
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds)).toISOString();
}

function hashShort(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
