import { describe, expect, it } from "vitest";
import {
  INDEXABLE_PATHS,
  ROBOTS_DISALLOW,
  SITE_DESCRIPTION,
  SITE_ORIGIN,
  pageSeo,
  siteJsonLd,
} from "@/lib/seo";

describe("seo contract", () => {
  it("pins the public origin", () => {
    expect(SITE_ORIGIN).toBe("https://ai-judge.genxmims.org");
  });

  it("keeps the default description in the Google snippet window", () => {
    expect(SITE_DESCRIPTION.length).toBeGreaterThan(120);
    expect(SITE_DESCRIPTION.length).toBeLessThanOrEqual(165);
  });

  it("does not list private operator routes as indexable", () => {
    for (const path of ["/admin", "/settings", "/run", "/runs", "/api", "/bundles/new"]) {
      expect(INDEXABLE_PATHS).not.toContain(path);
    }
  });

  it("disallows api, admin, settings, and run prefixes", () => {
    expect([...ROBOTS_DISALLOW]).toEqual([
      "/api/",
      "/admin",
      "/settings",
      "/run",
      "/bundles/new",
    ]);
  });

  it("marks operator pages noindex", () => {
    const meta = pageSeo({
      title: "Settings",
      description: "Workspace settings.",
      path: "/settings",
      index: false,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
    expect(meta.alternates).toEqual({ canonical: "/settings" });
  });

  it("emits schema.org graph with website and software application", () => {
    const ld = siteJsonLd();
    const graph = ld["@graph"] as Array<{ "@type": string }>;
    expect(graph.map((node) => node["@type"])).toEqual([
      "WebSite",
      "SoftwareApplication",
      "Person",
    ]);
  });
});
