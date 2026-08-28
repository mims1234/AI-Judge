"use client";

import { createContext, useContext } from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ViewTracker } from "@/components/traffic/ViewTracker";

export type AuthFlags = {
  canDevSignIn: boolean;
  canDiscordSignIn: boolean;
};

const AuthFlagsContext = createContext<AuthFlags>({
  canDevSignIn: false,
  canDiscordSignIn: false,
});

export function useAuthFlags(): AuthFlags {
  return useContext(AuthFlagsContext);
}

export function AuthProviders({
  session,
  canDevSignIn,
  canDiscordSignIn,
  children,
}: {
  session: Session | null;
  canDevSignIn: boolean;
  canDiscordSignIn: boolean;
  children: React.ReactNode;
}) {
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <AuthFlagsContext.Provider value={{ canDevSignIn, canDiscordSignIn }}>
        <ViewTracker />
        {children}
      </AuthFlagsContext.Provider>
    </SessionProvider>
  );
}
