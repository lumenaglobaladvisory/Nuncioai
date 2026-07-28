import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { DEMO_USER_EMAIL } from "@/lib/demo";

const providers = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.modify",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/calendar.events",
          ].join(" "),
          access_type: "offline",
          // "consent" is required to get a refresh_token back from Google
          // every time; "select_account" forces the account chooser instead
          // of silently reusing whichever Google account is already signed
          // in in the browser, so you can pick the right one.
          prompt: "consent select_account",
        },
      },
    })
  );
}

if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || "common"}/v2.0`,
      authorization: {
        params: { scope: "openid email profile offline_access Mail.ReadWrite Mail.Send Calendars.ReadWrite" },
      },
    })
  );
}

// Always-available demo sign-in so the app can be exercised end-to-end
// without real Google/Microsoft OAuth credentials configured. Resolves to
// the seeded demo user (see prisma/seed.ts) with a "mock" connected mailbox.
providers.push(
  Credentials({
    id: "demo",
    name: "Demo Account",
    credentials: {},
    async authorize() {
      const demoUser = await prisma.user.findUnique({ where: { email: DEMO_USER_EMAIL } });
      if (!demoUser) return null;
      return { id: demoUser.id, email: demoUser.email, name: demoUser.name };
    },
  })
);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login" },
  // Vercel (and most PaaS platforms) sit behind a reverse proxy, so the
  // incoming Host header isn't inherently trustworthy from Auth.js's
  // perspective - this must be explicitly opted into in production.
  // https://errors.authjs.dev#untrustedhost
  trustHost: true,
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  events: {
    async signIn({ user, account }) {
      if (!account || !user.id || !user.email) return;
      const providerKey = account.provider === "google" ? "google" : account.provider === "microsoft-entra-id" ? "microsoft" : null;
      if (!providerKey) return;
      await prisma.connectedAccount.upsert({
        where: { userId_provider_email: { userId: user.id, provider: providerKey, email: user.email } },
        create: {
          userId: user.id,
          provider: providerKey,
          email: user.email,
          displayName: user.name ?? undefined,
          accessToken: account.access_token ?? undefined,
          refreshToken: account.refresh_token ?? undefined,
          expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
        },
        update: {
          accessToken: account.access_token ?? undefined,
          refreshToken: account.refresh_token ?? undefined,
          expiresAt: account.expires_at ? new Date(account.expires_at * 1000) : undefined,
        },
      });
    },
  },
});
