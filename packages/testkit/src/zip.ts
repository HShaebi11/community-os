import { strToU8, zipSync } from "fflate";

/** Build a real WhatsApp-style export zip: `_chat.txt` plus any attachment
 *  files (e.g. `{ "poster.jpg": bytes }`). */
export function makeWhatsAppZip(chatText: string, attachments: Record<string, Uint8Array | string> = {}) {
  const files: Record<string, Uint8Array> = { "_chat.txt": strToU8(chatText) };
  for (const [name, data] of Object.entries(attachments)) {
    files[name] = typeof data === "string" ? strToU8(data) : data;
  }
  return zipSync(files);
}
