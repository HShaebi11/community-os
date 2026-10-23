import { sha256Hex } from "@community-os/core";

export type EmailEnv = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export type EmailKind = "magic-link" | "reset-password" | "invite";

export type OutboxEntry = {
  kind: EmailKind;
  to: string;
  link: string;
  subject: string;
  sentAt: string;
};

export const devOutbox: OutboxEntry[] = [];

const FROM_FALLBACK = "Community OS <onboarding@resend.dev>";

const TEMPLATES: Record<EmailKind, { subject: string; heading: string; action: string }> = {
  "magic-link": {
    subject: "Your Community OS sign-in link",
    heading: "Sign in to Community OS",
    action: "Sign in",
  },
  "reset-password": {
    subject: "Reset your Community OS password",
    heading: "Reset your password",
    action: "Reset password",
  },
  invite: {
    subject: "You're invited to a Community OS workspace",
    heading: "You're invited",
    action: "Accept invitation",
  },
};

function render(kind: EmailKind, link: string) {
  const t = TEMPLATES[kind];
  const html = `<!doctype html>
<html><body style="font-family:system-ui,sans-serif;background:#0b0d0a;color:#e6e6e6;padding:32px">
<div style="max-width:480px;margin:0 auto">
<h1 style="font-size:20px">${t.heading}</h1>
<p style="color:#9aa09a">Click the button below to continue.</p>
<p><a href="${link}" style="display:inline-block;background:#c8f04a;color:#0b0d0a;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${t.action}</a></p>
<p style="color:#9aa09a;font-size:12px;word-break:break-all">Or paste this link: ${link}</p>
<p style="color:#6b706b;font-size:12px">Community OS</p>
</div></body></html>`;
  const text = `${t.heading}\n\n${link}\n\nCommunity OS`;
  return { subject: t.subject, html, text };
}

export async function sendEmail(
  env: EmailEnv,
  input: { to: string; kind: EmailKind; link: string },
): Promise<void> {
  const { subject, html, text } = render(input.kind, input.link);
  if (!env.RESEND_API_KEY) {
    console.log(JSON.stringify({ message: "email (not sent)", kind: input.kind, to: input.to, link: input.link }));
    devOutbox.unshift({ kind: input.kind, to: input.to, link: input.link, subject, sentAt: new Date().toISOString() });
    if (devOutbox.length > 50) devOutbox.length = 50;
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
      "idempotency-key": await sha256Hex(`${input.kind}:${input.to}:${input.link}`),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || FROM_FALLBACK,
      to: [input.to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(JSON.stringify({ message: "email send failed", kind: input.kind, to: input.to, status: res.status, body }));
    throw new Error(`email send failed: ${res.status}`);
  }
}
