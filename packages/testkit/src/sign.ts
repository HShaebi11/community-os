import { createHmac } from "node:crypto";

/** Slack Events API signing: `v0=HMAC_SHA256(secret, "v0:ts:body")`. */
export function slackSign(secret: string, timestamp: string, body: string) {
  const hex = createHmac("sha256", secret).update(`v0:${timestamp}:${body}`).digest("hex");
  return `v0=${hex}`;
}

/** Meta/WhatsApp Cloud signing: `sha256=HMAC_SHA256(secret, body)`. */
export function metaSign(secret: string, body: string) {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

/** Community OS outbound webhook signing — must stay identical to the
 *  algorithm `verifyWebhookSignature` in @community-os/sdk verifies. */
export function cosSign(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}
