import "server-only";

import { getUserById, type AppUser } from "@/lib/server/users";

export type { AppUser };

export const TEST_USER_HEADER = "x-ai-judge-user-id";

let testSession: AppUser | null = null;

/** Tests only — bypass Auth.js cookies. */
export function setTestSession(user: AppUser | null): void {
  testSession = user;
}

export function getTestSession(): AppUser | null {
  return testSession;
}

export async function getSessionUser(request?: Request): Promise<AppUser | null> {
  if (testSession) return testSession;

  // Header spoofing is Vitest-only — never honor it under next dev/start,
  // even when AI_JUDGE_MODE=dev. The seeded founding-admin UUID is public.
  if (request && process.env.VITEST) {
    const headerId = request.headers.get(TEST_USER_HEADER)?.trim();
    if (headerId) return getUserById(headerId);
  }

  // Vitest cannot load next-auth → next/server. Tests use setTestSession / header.
  if (process.env.VITEST) return null;

  const { auth, canBootAuth } = await import("@/auth");
  if (!canBootAuth()) return null;
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return null;
    return getUserById(id);
  } catch {
    return null;
  }
}

export class AuthRequiredError extends Error {
  constructor(message = "Sign in to continue.") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You cannot do that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireSession(request?: Request): Promise<AppUser> {
  const user = await getSessionUser(request);
  if (!user) throw new AuthRequiredError();
  return user;
}

export function assertSameUser(actorId: string, ownerId: string | null): void {
  if (ownerId && actorId !== ownerId) {
    throw new ForbiddenError("Only the owner can do that.");
  }
}
