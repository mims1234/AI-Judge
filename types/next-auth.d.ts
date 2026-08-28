import type { DefaultSession } from "@auth/core/types";
import type { StaffRole } from "../lib/staff";

declare module "@auth/core/types" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      discord_id: string;
      role: StaffRole;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    username?: string;
    avatar_url?: string | null;
    discord_id?: string;
    role?: StaffRole;
  }
}

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      discord_id: string;
      role: StaffRole;
    };
  }
}
