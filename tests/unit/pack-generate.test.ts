import { describe, expect, it, vi } from "vitest";
import { finalizeGeneratedPack } from "@/lib/bundles/finalize-generated";
import {
  countStreamedTasks,
  generateProgress,
} from "@/lib/bundles/generate-progress";
import { CUSTOM_JSON_FOOTER } from "@/lib/bundles/custom";
import { messageFromFailedResponse } from "@/lib/client/packGenerate";
import { OpenRouterError } from "@/lib/openrouter";
import { mapThrownApiError } from "@/lib/server/httpErrors";
import { iterateSseFrames, splitSseFrames } from "@/lib/sse-parse";

describe("splitSseFrames", () => {
  it("splits coalesced frames and leaves a partial tail", () => {
    const { frames, rest } = splitSseFrames(
      'event: generate.status\ndata: {"phase":"writing"}\n\nevent: generate.delta\ndata: {"delta":"{\\"tasks\\""}\n\nevent: generate.delta\ndata: {"delta":":[]"}\n\npartial',
    );
    expect(frames.map((f) => f.event)).toEqual([
      "generate.status",
      "generate.delta",
      "generate.delta",
    ]);
    expect(JSON.parse(frames[1]!.data)).toEqual({ delta: '{"tasks"' });
    expect(rest).toBe("partial");
  });
});

describe("iterateSseFrames", () => {
  it("yields frames as bytes arrive", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: generate.delta\ndata: {\"delta\":\"ab\"}\n\n"));
        controller.enqueue(encoder.encode("event: generate.complete\ndata: {\"ok\":true}\n\n"));
        controller.close();
      },
    });
    const events: string[] = [];
    for await (const frame of iterateSseFrames(stream)) {
      events.push(frame.event);
    }
    expect(events).toEqual(["generate.delta", "generate.complete"]);
  });
});

describe("generateProgress", () => {
  it("counts streamed task_body keys", () => {
    expect(countStreamedTasks('{"tasks":[{"task_body":"one"},{"task_body":"two"}]}')).toBe(2);
  });

  it("moves the writing bar as tasks appear", () => {
    const early = generateProgress({ phase: "writing", text: "", slotCount: 2 });
    const mid = generateProgress({
      phase: "writing",
      text: '{"tasks":[{"task_body":"x"}]}',
      slotCount: 2,
    });
    expect(early.value).toBeLessThan(mid.value);
    expect(mid.label).toContain("1/2");
  });
});

describe("messageFromFailedResponse", () => {
  it("rewrites HTML error pages instead of leaking DOCTYPE", () => {
    const msg = messageFromFailedResponse(
      502,
      "<!DOCTYPE html><html><body>error</body></html>",
      "text/html",
    );
    expect(msg).not.toContain("<!DOCTYPE");
    expect(msg).toMatch(/connection dropped/i);
  });

  it("prefers JSON error messages", () => {
    expect(
      messageFromFailedResponse(
        401,
        JSON.stringify({ error: { message: "Sign in first." } }),
        "application/json",
      ),
    ).toBe("Sign in first.");
  });
});

describe("finalizeGeneratedPack", () => {
  it("pins slot categories and appends the footer", () => {
    const raw = JSON.stringify({
      tasks: [
        {
          category: "math",
          task_body:
            "Write a function that reverses a Unicode string without splitting surrogate pairs.",
          must_mention: ["grapheme"],
        },
      ],
    });
    const out = finalizeGeneratedPack({
      rawText: raw,
      slots: [{ category: "coding", prompt: "Harbor routing" }],
      notes: "",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.tasks[0]!.category).toBe("coding");
    expect(out.tasks[0]!.task_body).toContain(CUSTOM_JSON_FOOTER);
  });
});

describe("mapThrownApiError", () => {
  it("does not treat an aborted OpenRouter call as a 500", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = mapThrownApiError(new OpenRouterError("aborted", "aborted"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toMatch(/cancelled/i);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
