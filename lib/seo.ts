import type { Metadata } from "next";

export const SITE_ORIGIN = "https://ai-judge.genxmims.org";
export const SITE_NAME = "AI Judge";
export const SITE_CREATOR = "MiMs";

export const SITE_TITLE =
  "AI Judge — Blind LLM Benchmarks with Reproducible Rankings";

export const SITE_OG_TITLE = "AI Judge — Blind 3-Judge LLM Benchmark Lab";

/** ~158 chars — fits a standard Google snippet. */
export const SITE_DESCRIPTION =
  "Run versioned prompt bundles against any OpenRouter model. Three independent judges score answers blind at temperature 0. Reproducible, bundle-scoped rankings.";

/** Longer copy for Discord / Open Graph / Twitter cards. */
export const SITE_OG_DESCRIPTION =
  "AI Judge is a public LLM benchmark lab. Every candidate answers the same immutable prompt bundle. Deterministic validators check structure first. Then a seeded panel of three independent judges scores each answer blind — never seeing the model's name — at temperature 0. Medians become durable, reproducible rankings.";

export const SITE_KEYWORDS = [
  "AI Judge",
  "LLM benchmark",
  "LLM leaderboard",
  "blind judging",
  "model evaluation",
  "OpenRouter",
  "three judge panel",
  "reproducible rankings",
  "prompt bundle",
  "AI model comparison",
  "LLM evaluation",
  "temperature 0 judging",
];

export const INDEXABLE_PATHS = [
  "/",
  "/leaderboard",
  "/models",
  "/bundles",
  "/compare",
  "/judges",
  "/playground",
  "/playground/leaderboard",
  "/privacy",
  "/terms",
  "/cookies",
] as const;

/** Prefixes crawlers should skip. `/run` also covers `/runs` and `/runs/[id]`. */
export const ROBOTS_DISALLOW = [
  "/api/",
  "/admin",
  "/settings",
  "/run",
  "/bundles/new",
] as const;

const NOINDEX: Metadata["robots"] = { index: false, follow: false };

export function pageSeo({
  title,
  description,
  path,
  index = true,
}: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const url = new URL(path, SITE_ORIGIN).href;
  const branded = `${title} · ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: index ? { index: true, follow: true } : NOINDEX,
    openGraph: {
      title: branded,
      description,
      url,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: branded,
      description,
    },
  };
}

export function siteJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_ORIGIN}/#website`,
        url: `${SITE_ORIGIN}/`,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_ORIGIN}/#creator` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_ORIGIN}/#app`,
        name: SITE_NAME,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "Web",
        url: `${SITE_ORIGIN}/`,
        description: SITE_OG_DESCRIPTION,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        featureList: [
          "Versioned immutable prompt bundles",
          "Seeded blind three-judge panels",
          "Deterministic validators before judging",
          "Temperature-0 structured verdicts",
          "Bundle-scoped reproducible leaderboards",
          "OpenRouter model catalog",
        ],
        author: { "@id": `${SITE_ORIGIN}/#creator` },
      },
      {
        "@type": "Person",
        "@id": `${SITE_ORIGIN}/#creator`,
        name: SITE_CREATOR,
        url: SITE_ORIGIN,
      },
    ],
  };
}
