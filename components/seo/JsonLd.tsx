import { siteJsonLd } from "@/lib/seo";

/** Site-wide schema.org graph for search engines. */
export function JsonLd() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd()) }}
    />
  );
}
