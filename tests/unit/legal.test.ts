import { describe, expect, it } from "vitest";
import {
  CONTACT_DISCORD_ID,
  CONTACT_DISCORD_NAME,
  CONTACT_DISCORD_URL,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LINKS,
  OPERATOR_NAME,
  VISITOR_COOKIE_NAME,
} from "@/lib/legal";
import { FOUNDING_ADMIN_DISCORD_ID } from "@/lib/staff";
import { INDEXABLE_PATHS } from "@/lib/seo";

describe("legal contract", () => {
  it("names MiMs and pins Discord contact to the founding id", () => {
    expect(OPERATOR_NAME).toBe("MiMs");
    expect(CONTACT_DISCORD_NAME).toBe("MiMs");
    expect(CONTACT_DISCORD_ID).toBe(FOUNDING_ADMIN_DISCORD_ID);
    expect(CONTACT_DISCORD_URL).toBe(
      `https://discord.com/users/${FOUNDING_ADMIN_DISCORD_ID}`,
    );
  });

  it("exposes the three policy routes", () => {
    expect(LEGAL_LINKS.map((l) => l.href)).toEqual([
      "/privacy",
      "/terms",
      "/cookies",
    ]);
    expect(INDEXABLE_PATHS).toEqual(expect.arrayContaining(["/privacy", "/terms", "/cookies"]));
  });

  it("pins visitor cookie name and effective date", () => {
    expect(VISITOR_COOKIE_NAME).toBe("aij_vid");
    expect(LEGAL_EFFECTIVE_DATE).toMatch(/2026/);
  });
});
