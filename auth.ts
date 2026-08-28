import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import { getAiJudgeMode, isExplicitDevMode } from "@/lib/env";
import { getUserById, upsertDevUser, upsertUser } from "@/lib/server/users";

export function discordConfigured(): boolean {
  return Boolean(
    process.env.AUTH_DISCORD_ID?.trim() && process.env.AUTH_DISCORD_SECRET?.trim(),
  );
}

/** Auth.js can start when a secret exists, Discord is configured, or we are in lab mode. */
export function canBootAuth(): boolean {
  return (
    Boolean(process.env.AUTH_SECRET?.trim()) ||
    discordConfigured() ||
    getAiJudgeMode() === "dev"
  );
}

function buildProviders() {
  const providers = [];

  if (discordConfigured()) {
    providers.push(
      Discord({
        clientId: process.env.AUTH_DISCORD_ID,
        clientSecret: process.env.AUTH_DISCORD_SECRET,
        authorization: { params: { scope: "identify" } },
      }),
    );
  }

  if (isExplicitDevMode()) {
    providers.push(
      Credentials({
        id: "dev",
        name: "Dev",
        credentials: {
          username: { label: "Username", type: "text" },
        },
        authorize: async (credentials) => {
          if (!isExplicitDevMode()) return null;
          const raw =
            typeof credentials?.username === "string" && credentials.username.trim()
              ? credentials.username.trim()
              : "Dev";
          const user = upsertDevUser(raw.slice(0, 32));
          return {
            id: user.id,
            name: user.username,
            image: user.avatar_url,
          };
        },
      }),
    );
  }

  return providers;
}

function authSecret(): string | undefined {
  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  // next dev (or AI_JUDGE_MODE=dev) — Auth.js refuses to boot without a secret.
  // Production Node must set AUTH_SECRET explicitly.
  if (getAiJudgeMode() === "dev" || process.env.NODE_ENV !== "production") {
    return "dev-only-auth-secret-not-for-production-use-32b";
  }
  return undefined;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: authSecret(),
  session: { strategy: "jwt" },
  providers: buildProviders(),
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "discord" && profile) {
        const p = profile as {
          id?: string;
          username?: string;
          global_name?: string;
          avatar?: string | null;
        };
        const discordId = p.id ?? "";
        const username = p.username || p.global_name || "discord-user";
        const avatar =
          discordId && p.avatar
            ? `https://cdn.discordapp.com/avatars/${discordId}/${p.avatar}.png`
            : null;
        if (discordId) {
          const row = upsertUser({
            discord_id: discordId,
            username,
            avatar_url: avatar,
          });
          token.uid = row.id;
          token.username = row.username;
          token.avatar_url = row.avatar_url;
          token.discord_id = row.discord_id;
          token.role = row.role;
        }
      }

      if (account?.provider === "dev" && user?.id) {
        const row = getUserById(user.id);
        token.uid = user.id;
        token.username = row?.username ?? user.name ?? "Dev";
        token.avatar_url = row?.avatar_url ?? user.image ?? null;
        token.discord_id = row?.discord_id ?? "dev";
        token.role = row?.role ?? "user";
      }

      return token;
    },
    async session({ session, token }) {
      const uid = typeof token.uid === "string" ? token.uid : "";
      if (session.user && uid) {
        session.user.id = uid;
        session.user.name =
          typeof token.username === "string" ? token.username : session.user.name;
        session.user.image =
          typeof token.avatar_url === "string" ? token.avatar_url : session.user.image;
        session.user.discord_id =
          typeof token.discord_id === "string" ? token.discord_id : "";
        session.user.role =
          token.role === "admin" || token.role === "moderator" ? token.role : "user";
      }
      return session;
    },
  },
});
