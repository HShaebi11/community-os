import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, magicLink, organization } from "better-auth/plugins";
import * as schema from "@community-os/db/schema";
import type { Database } from "@community-os/db";
import { sendEmail } from "./email.ts";

export type AuthEnv = {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  APP_ORIGINS?: string;
  ALLOW_DEV_AUTH?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
};

export const DEFAULT_APP_ORIGINS = "http://localhost:3002,http://localhost:3000";

// Dev-only: trust sign-up/sign-in from ANY loopback origin (any port) so
// browser preview proxies with dynamic localhost ports work. better-auth's
// trustedOrigins matcher supports `*` wildcards per port segment.
const DEV_LOOPBACK_ORIGINS = [
  "http://localhost",
  "http://localhost:*",
  "https://localhost",
  "https://localhost:*",
  "http://127.0.0.1",
  "http://127.0.0.1:*",
  "https://127.0.0.1",
  "https://127.0.0.1:*",
  "http://[::1]",
  "http://[::1]:*",
  "https://[::1]",
  "https://[::1]:*",
];

export function createAuth(db: Database, env: AuthEnv, fallbackBaseURL: string) {
  const baseURL = env.BETTER_AUTH_URL ?? fallbackBaseURL;
  const appOrigins = (env.APP_ORIGINS || DEFAULT_APP_ORIGINS)
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, { to: user.email, kind: "reset-password", link: url });
      },
    },
    socialProviders: hasGoogle
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID!,
            clientSecret: env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : undefined,
    plugins: [
      bearer(),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendEmail(env, { to: email, kind: "magic-link", link: url });
        },
      }),
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: "owner",
        requireEmailVerificationOnInvitation: false,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        sendInvitationEmail: async ({ id, email }) => {
          await sendEmail(env, {
            to: email,
            kind: "invite",
            link: `${baseURL}/invite/${id}`,
          });
        },
      }),
    ],
    trustedOrigins:
      env.ALLOW_DEV_AUTH === "true"
        ? [...(appOrigins.length ? appOrigins : [baseURL]), ...DEV_LOOPBACK_ORIGINS]
        : appOrigins.length
          ? appOrigins
          : [baseURL],
    rateLimit: { enabled: true },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: baseURL.startsWith("https://"),
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
