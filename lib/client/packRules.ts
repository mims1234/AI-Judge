export const PACK_RULES_ACK_KEY = "ai-judge:bundle-rules-ack";
const LEGACY_PACK_RULES_ACK_KEY = "ai-judge:pack-rules-ack";

export const PACK_RULES = [
  "You add 1–5 prompts. Each has a type. The same type can appear more than once. General and Other are catch-alls when the listed types do not fit.",
  "Judge criteria are generated from your prompts. You review them before publish.",
  "Each prompt is its own brief. Optional notes are untrusted reference material.",
  "Must-mention phrases are judge-only. Candidates never see them.",
  "The lab owns the JSON: every task uses { \"answer\": \"<your full response>\" }.",
  "The generator cannot invent schemas. We pin the footer.",
  "Bundle review labels weak tests. Publish is blocked on answer leak, missing criteria, or a review score below 6.",
  "Published bundles cannot be edited or deleted. They are public, credited to your Discord name.",
  "Sign in is required to create, publish, and launch a run. Viewing stays open.",
  "Your OpenRouter key lives in this browser, is sent to this server for the call, and is held in memory for the run. Never SQLite, disk, session, or logs. Discord never sees it.",
  "Do not write sexual content involving minors, weapons, pathogens, or crime-as-the-task.",
] as const;

export function hasPackRulesAck(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      sessionStorage.getItem(PACK_RULES_ACK_KEY) === "1" ||
      sessionStorage.getItem(LEGACY_PACK_RULES_ACK_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function setPackRulesAck(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PACK_RULES_ACK_KEY, "1");
  } catch {
    // quota / private mode
  }
}
