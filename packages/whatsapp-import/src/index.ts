import { strFromU8, unzipSync } from "fflate";
import { parseWhatsAppTranscript } from "@community-os/core";

export type ParsedWhatsAppMessage = {
  sourceMessageId: string;
  authorRaw: string;
  body: string;
  sentAt: string;
  attachedNames: string[];
};

export type ExportFile = {
  name: string;
  bytes: Uint8Array;
  mime: string;
};

export type ParsedExport = {
  transcript: string;
  messages: ParsedWhatsAppMessage[];
  files: ExportFile[];
};

export function parseWhatsAppExport(bytes: Uint8Array, filename = "export.zip"): ParsedExport {
  if (filename.endsWith(".txt") || looksLikeText(bytes)) {
    const transcript = new TextDecoder().decode(bytes);
    return { transcript, messages: parseWhatsAppTranscript(transcript), files: [] };
  }
  const unzipped = unzipSync(bytes);
  let transcript = "";
  const files: ExportFile[] = [];
  for (const [name, data] of Object.entries(unzipped)) {
    /* v8 ignore next -- split() always yields >=1 element, so at(-1) is never undefined */
    const base = name.split("/").at(-1) ?? name;
    if (base.endsWith(".txt") && (base.includes("chat") || base.startsWith("_chat") || !transcript)) {
      transcript = strFromU8(data);
    } else if (!base.endsWith(".txt")) {
      files.push({ name: base, bytes: data, mime: mimeFor(base) });
    }
  }
  if (!transcript) throw new Error("No chat.txt in WhatsApp export");
  return { transcript, messages: parseWhatsAppTranscript(transcript), files };
}

function looksLikeText(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 20));
  return head.startsWith("[") || /^\d{1,2}[\/.-]/.test(head);
}

function mimeFor(name: string): string {
  const ext = name.split(".").at(-1)?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "pdf") return "application/pdf";
  return "application/octet-stream";
}
