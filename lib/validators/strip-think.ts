/** Remove model scratchpad tags. Keep the visible answer. */
export function stripThinkTags(raw: string): string {
  if (!raw) return raw;
  let out = raw.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  // Unclosed block: thinking never finished — drop it so we don't parse scratchpad as JSON.
  out = out.replace(/<think\b[^>]*>[\s\S]*$/i, "");
  return out.replace(/<\/think>/gi, "").trim();
}
