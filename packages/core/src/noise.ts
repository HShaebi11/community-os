const NOISE =
  /^(ok+|k+|lol+|lmao+|haha+|yes|yep|yeah|no|nah|thanks|thank you|ty|np|cool+|nice+|omg+|same|this|true|\+|👍|😂|🔥|joined using this group's invite link|left|removed|added|messages and calls are end-to-end encrypted|created group|changed the (subject|group description|group icon)|this message was deleted|<media omitted>|image omitted|video omitted|sticker omitted)$/i;

export function isNoiseMessage(body: string, authorRaw: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return true;
  if (authorRaw.toLowerCase() === "whatsapp") return true;
  if (NOISE.test(trimmed)) return true;
  if (trimmed.length < 3) return true;
  return false;
}

export function extractUrls(body: string): string[] {
  return [...body.matchAll(/https?:\/\/[^\s)]+/gi)].map((m) => m[0].replace(/[.,;]+$/, ""));
}
