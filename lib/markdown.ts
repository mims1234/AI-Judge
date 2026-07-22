import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitized Markdown pipeline for completed model output (plans/07 §5).
 * Raw escaped text while streaming; this renderer only once done.
 * Allowlist: headings, lists, code, tables, links (rel="noopener nofollow").
 */

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4",
    "p", "ul", "ol", "li",
    "code", "pre",
    "table", "thead", "tbody", "tr", "th", "td",
    "a", "strong", "em", "blockquote", "hr", "br",
  ],
  ALLOWED_ATTR: ["href", "title", "rel", "target"],
};

let hookBound = false;

function ensureLinkHook(): void {
  if (hookBound) return;
  hookBound = true;
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("rel", "noopener nofollow");
      node.setAttribute("target", "_blank");
    }
  });
}

/** Markdown string → sanitized HTML (safe for dangerouslySetInnerHTML). */
export function renderMarkdown(markdown: string): string {
  ensureLinkHook();
  const html = marked.parse(markdown, { async: false, gfm: true }) as string;
  return DOMPurify.sanitize(html, PURIFY_CONFIG);
}
