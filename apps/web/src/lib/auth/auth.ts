import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { getDatabase } from "../../db/client";
import * as schema from "../../db/schema";
import { getAuthEnv } from "../../env/server";
import { parseOrigins } from "../api/origin-allowlist";

const env = getAuthEnv();

export const auth = betterAuth({
  appName: "Transcriptly",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(getDatabase(), {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    },
  },
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      // Do not mark either provider as trusted: implicit linking must prove
      // that both the incoming provider email and existing email are verified.
      enabled: true,
      disableImplicitLinking: false,
      requireLocalEmailVerified: true,
      allowDifferentEmails: false,
    },
  },
  databaseHooks: {
    account: {
      create: {
        // Better Auth encrypts access/refresh tokens with the option above.
        // An ID token is not needed after callback verification, so discard it
        // rather than retaining bearer material in plaintext.
        before: async (account) => ({ data: { ...account, idToken: null } }),
      },
      update: {
        before: async (account) => ({ data: { ...account, idToken: null } }),
      },
    },
  },
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  trustedOrigins: [
    env.BETTER_AUTH_URL,
    // The extension background calls auth endpoints (sign-out) with
    // Origin: chrome-extension://<id>; only exact builds are trusted.
    ...parseOrigins(env.EXTENSION_ORIGINS),
  ],
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
