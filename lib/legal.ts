import { FOUNDING_ADMIN_DISCORD_ID } from "@/lib/staff";

/** Operator named on the site — a handle, not a registered company. */
export const OPERATOR_NAME = "MiMs";

export const LEGAL_EFFECTIVE_DATE = "28 August 2026";

export const CONTACT_DISCORD_NAME = "MiMs";
export const CONTACT_DISCORD_ID = FOUNDING_ADMIN_DISCORD_ID;
export const CONTACT_DISCORD_URL = `https://discord.com/users/${CONTACT_DISCORD_ID}`;

export const OPENROUTER_PRIVACY_URL = "https://openrouter.ai/privacy";
export const OPENROUTER_TERMS_URL = "https://openrouter.ai/terms";
export const DISCORD_PRIVACY_URL = "https://discord.com/privacy";
export const DISCORD_TERMS_URL = "https://discord.com/terms";

export const VISITOR_COOKIE_NAME = "aij_vid";
export const VISITOR_COOKIE_MAX_DAYS = 400;
export const TRAFFIC_RETENTION_DAYS = 200;

export const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/cookies", label: "Cookies" },
] as const;
