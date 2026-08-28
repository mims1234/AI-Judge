import { auth, canBootAuth, discordConfigured } from "@/auth";
import { isExplicitDevMode } from "@/lib/env";
import { AuthProviders } from "@/components/auth/AuthProviders";

/** Server child — reads session without making root layout async. */
export async function AuthRoot({ children }: { children: React.ReactNode }) {
  let session = null;
  if (canBootAuth()) {
    try {
      session = await auth();
    } catch {
      session = null;
    }
  }
  return (
    <AuthProviders
      session={session}
      canDevSignIn={isExplicitDevMode()}
      canDiscordSignIn={discordConfigured()}
    >
      {children}
    </AuthProviders>
  );
}
