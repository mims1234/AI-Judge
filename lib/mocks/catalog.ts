import type { CatalogModel } from "@/lib/openrouter";

/**
 * DEMO ONLY — deterministic synthetic OpenRouter catalog (~420 models).
 * Used by /models and the wizard when `?demo=1` is active, so the interface
 * can be explored without an API key or network. Realistic shapes; not real
 * availability or pricing. Never merged into real data paths.
 */

type Anchor = {
  id: string;
  name: string;
  ctx: number;
  in: number; // usd per M prompt
  out: number; // usd per M completion
  structured?: boolean;
};

const ANCHORS: Anchor[] = [
  { id: "openai/gpt-5.1", name: "GPT-5.1", ctx: 400_000, in: 1.25, out: 10, structured: true },
  { id: "openai/gpt-5", name: "GPT-5", ctx: 400_000, in: 1.25, out: 10, structured: true },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini", ctx: 400_000, in: 0.25, out: 2, structured: true },
  { id: "openai/gpt-5-nano", name: "GPT-5 Nano", ctx: 400_000, in: 0.05, out: 0.4, structured: true },
  { id: "openai/o4-mini", name: "o4 Mini", ctx: 200_000, in: 1.1, out: 4.4, structured: true },
  { id: "openai/o3", name: "o3", ctx: 200_000, in: 2, out: 8, structured: true },
  { id: "openai/gpt-4.1", name: "GPT-4.1", ctx: 1_000_000, in: 2, out: 8, structured: true },
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5", ctx: 1_000_000, in: 3, out: 15, structured: true },
  { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5", ctx: 200_000, in: 15, out: 75, structured: true },
  { id: "anthropic/claude-haiku-4", name: "Claude Haiku 4", ctx: 200_000, in: 0.8, out: 4, structured: true },
  { id: "google/gemini-3-pro", name: "Gemini 3 Pro", ctx: 1_000_000, in: 1.25, out: 10, structured: true },
  { id: "google/gemini-3-flash", name: "Gemini 3 Flash", ctx: 1_000_000, in: 0.3, out: 2.5, structured: true },
  { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", ctx: 1_000_000, in: 0.1, out: 0.4, structured: true },
  { id: "deepseek/deepseek-v4", name: "DeepSeek V4", ctx: 164_000, in: 0.27, out: 1.1, structured: true },
  { id: "deepseek/deepseek-r1", name: "DeepSeek R1", ctx: 164_000, in: 0.55, out: 2.19, structured: true },
  { id: "deepseek/deepseek-chat-v3.1", name: "DeepSeek Chat V3.1", ctx: 164_000, in: 0.27, out: 1.1, structured: true },
  { id: "x-ai/grok-4.1", name: "Grok 4.1", ctx: 256_000, in: 3, out: 15, structured: true },
  { id: "x-ai/grok-4-fast", name: "Grok 4 Fast", ctx: 2_000_000, in: 0.2, out: 0.5, structured: true },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", ctx: 1_000_000, in: 0.2, out: 0.6, structured: true },
  { id: "meta-llama/llama-4-scout", name: "Llama 4 Scout", ctx: 10_000_000, in: 0.1, out: 0.3, structured: true },
  { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct", ctx: 128_000, in: 0.12, out: 0.3 },
  { id: "qwen/qwen3-235b-a22b", name: "Qwen3 235B", ctx: 262_000, in: 0.2, out: 0.8, structured: true },
  { id: "qwen/qwen3-32b", name: "Qwen3 32B", ctx: 131_000, in: 0.1, out: 0.3 },
  { id: "qwen/qwen3-coder", name: "Qwen3 Coder", ctx: 262_000, in: 0.3, out: 1.2, structured: true },
  { id: "mistralai/mistral-large-3", name: "Mistral Large 3", ctx: 262_000, in: 0.5, out: 1.5, structured: true },
  { id: "mistralai/mistral-medium-3.1", name: "Mistral Medium 3.1", ctx: 131_000, in: 0.4, out: 2, structured: true },
  { id: "mistralai/mistral-small-3.2", name: "Mistral Small 3.2", ctx: 131_000, in: 0.1, out: 0.3 },
  { id: "mistralai/codestral-2508", name: "Codestral 25.08", ctx: 256_000, in: 0.3, out: 0.9, structured: true },
  { id: "microsoft/phi-4", name: "Phi-4", ctx: 16_000, in: 0.07, out: 0.14 },
  { id: "microsoft/phi-4-reasoning", name: "Phi-4 Reasoning", ctx: 32_000, in: 0.1, out: 0.2 },
  { id: "nvidia/llama-3.1-nemotron-70b", name: "Nemotron 70B", ctx: 131_000, in: 0.35, out: 0.4 },
  { id: "cohere/command-a", name: "Command A", ctx: 256_000, in: 2.5, out: 10, structured: true },
  { id: "cohere/command-r-plus", name: "Command R+", ctx: 128_000, in: 2.5, out: 10 },
  { id: "amazon/nova-pro-v1", name: "Nova Pro", ctx: 300_000, in: 0.8, out: 3.2, structured: true },
  { id: "amazon/nova-lite-v1", name: "Nova Lite", ctx: 300_000, in: 0.06, out: 0.24 },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", ctx: 262_000, in: 0.6, out: 2.5, structured: true },
  { id: "moonshotai/kimi-k2", name: "Kimi K2", ctx: 131_000, in: 0.55, out: 2.2, structured: true },
  { id: "z-ai/glm-4.6", name: "GLM 4.6", ctx: 200_000, in: 0.4, out: 1.75, structured: true },
  { id: "minimax/minimax-m2", name: "MiniMax M2", ctx: 1_000_000, in: 0.3, out: 1.2, structured: true },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", ctx: 131_000, in: 0.05, out: 0.25 },
  { id: "openai/gpt-oss-20b", name: "GPT OSS 20B", ctx: 131_000, in: 0.03, out: 0.12 },
  { id: "google/gemma-3-27b-it", name: "Gemma 3 27B", ctx: 131_000, in: 0.07, out: 0.14 },
  { id: "meta-llama/llama-3.1-8b-instruct", name: "Llama 3.1 8B", ctx: 128_000, in: 0.02, out: 0.05 },
  { id: "qwen/qwen3-8b", name: "Qwen3 8B", ctx: 131_000, in: 0.04, out: 0.1 },
  { id: "mistralai/mistral-nemo", name: "Mistral Nemo", ctx: 131_000, in: 0.02, out: 0.04 },
  { id: "deepseek/deepseek-v4:free", name: "DeepSeek V4 (free)", ctx: 164_000, in: 0, out: 0 },
  { id: "google/gemini-3-flash:free", name: "Gemini 3 Flash (free)", ctx: 1_000_000, in: 0, out: 0 },
  { id: "meta-llama/llama-3.3-70b-instruct:free", name: "Llama 3.3 70B (free)", ctx: 128_000, in: 0, out: 0 },
];

const FAMILIES: Array<{ suffix: string; label: string; ctxScale: number; priceScale: number }> = [
  { suffix: "", label: "", ctxScale: 1, priceScale: 1 },
  { suffix: "-2026-03", label: " (2026-03)", ctxScale: 1, priceScale: 1 },
  { suffix: "-2025-11", label: " (2025-11)", ctxScale: 1, priceScale: 0.85 },
  { suffix: "-turbo", label: " Turbo", ctxScale: 1.5, priceScale: 1.4 },
  { suffix: "-extended", label: " Extended", ctxScale: 2, priceScale: 1.2 },
  { suffix: "-fast", label: " Fast", ctxScale: 0.75, priceScale: 0.6 },
  { suffix: "-instruct", label: " Instruct", ctxScale: 1, priceScale: 0.7 },
  { suffix: "-chat", label: " Chat", ctxScale: 1, priceScale: 0.7 },
];

/** Deterministic ~420-entry catalog. */
export function buildDemoCatalog(): CatalogModel[] {
  const out: CatalogModel[] = [];
  let variantCursor = 0;

  for (const anchor of ANCHORS) {
    for (let v = 0; v < FAMILIES.length && out.length < 460; v++) {
      const fam = FAMILIES[(variantCursor + v) % FAMILIES.length]!;
      // First entry per anchor is always the anchor itself.
      const isBase = v === 0;
      const id = isBase ? anchor.id : `${anchor.id}${fam.suffix}`;
      if (out.some((m) => m.id === id)) continue;
      const priceIn = isBase ? anchor.in : anchor.in * fam.priceScale;
      const priceOut = isBase ? anchor.out : anchor.out * fam.priceScale;
      const free = priceIn === 0 && priceOut === 0;
      out.push({
        id,
        name: `${anchor.name}${isBase ? "" : fam.label}`,
        context_length: Math.round((anchor.ctx * (isBase ? 1 : fam.ctxScale)) / 1000) * 1000,
        pricing: free
          ? { prompt_usd_per_m: 0, completion_usd_per_m: 0 }
          : {
              prompt_usd_per_m: Math.round(priceIn * 100) / 100,
              completion_usd_per_m: Math.round(priceOut * 100) / 100,
            },
        supports_structured_outputs: anchor.structured ?? false,
        is_free: free,
      });
    }
    variantCursor += 3;
  }

  return out;
}

export const DEMO_CATALOG_FETCHED_AT = "2026-07-22T09:14:00.000Z";

export function demoModelById(id: string): CatalogModel | null {
  return buildDemoCatalog().find((m) => m.id === id) ?? null;
}
