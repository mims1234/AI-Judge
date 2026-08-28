import type { MetadataRoute } from "next";
import { INDEXABLE_PATHS, SITE_ORIGIN } from "@/lib/seo";

const PRIORITY: Record<string, number> = {
  "/": 1,
  "/leaderboard": 0.9,
  "/models": 0.8,
  "/bundles": 0.8,
  "/compare": 0.7,
  "/judges": 0.7,
  "/playground": 0.65,
  "/playground/leaderboard": 0.55,
  "/privacy": 0.3,
  "/terms": 0.3,
  "/cookies": 0.3,
};

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return INDEXABLE_PATHS.map((path) => ({
    url: path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path}`,
    lastModified,
    changeFrequency: path === "/leaderboard" ? "daily" : "weekly",
    priority: PRIORITY[path] ?? 0.5,
  }));
}
