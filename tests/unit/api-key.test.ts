import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  hasApiKey,
  hasServerKey,
  resolveApiKey,
} from "@/lib/openrouter";
import { getAiJudgeMode, resetEnvCache } from "@/lib/env";

function setNodeEnv(value: string) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

describe("resolveApiKey (BYOK precedence)", () => {
  const prevKey = process.env.OPENROUTER_API_KEY;
  const prevNodeEnv = process.env.NODE_ENV;
  const prevMode = process.env.AI_JUDGE_MODE;

  beforeEach(() => {
    delete process.env.AI_JUDGE_MODE;
    resetEnvCache();
  });

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
    if (prevMode === undefined) delete process.env.AI_JUDGE_MODE;
    else process.env.AI_JUDGE_MODE = prevMode;
    setNodeEnv(prevNodeEnv ?? "test");
    resetEnvCache();
  });

  it("prefers an explicit user key over the env key", () => {
    setNodeEnv("development");
    process.env.OPENROUTER_API_KEY = "env-key-xxxx";
    expect(resolveApiKey("user-key-yyyy")).toBe("user-key-yyyy");
  });

  it("falls back to env key outside production", () => {
    setNodeEnv("development");
    process.env.OPENROUTER_API_KEY = "env-key-xxxx";
    expect(resolveApiKey()).toBe("env-key-xxxx");
    expect(resolveApiKey(null)).toBe("env-key-xxxx");
    expect(resolveApiKey("")).toBe("env-key-xxxx");
    expect(hasServerKey()).toBe(true);
    expect(hasApiKey()).toBe(true);
  });

  it("also falls back to env key under NODE_ENV=test", () => {
    setNodeEnv("test");
    process.env.OPENROUTER_API_KEY = "test-key";
    expect(resolveApiKey()).toBe("test-key");
    expect(hasServerKey()).toBe(true);
  });

  it("ignores env key in production when no user key is provided", () => {
    setNodeEnv("production");
    process.env.OPENROUTER_API_KEY = "env-key-xxxx";
    expect(resolveApiKey()).toBeNull();
    expect(resolveApiKey(null)).toBeNull();
    expect(hasServerKey()).toBe(false);
    expect(hasApiKey()).toBe(false);
  });

  it("accepts a user key in production", () => {
    setNodeEnv("production");
    process.env.OPENROUTER_API_KEY = "env-key-xxxx";
    expect(resolveApiKey("  sk-or-user  ")).toBe("sk-or-user");
    expect(hasApiKey("sk-or-user")).toBe(true);
  });

  it("returns null when neither user nor env key is available", () => {
    setNodeEnv("development");
    delete process.env.OPENROUTER_API_KEY;
    expect(resolveApiKey()).toBeNull();
    expect(hasApiKey()).toBe(false);
    expect(hasServerKey()).toBe(false);
  });

  it("AI_JUDGE_MODE=prod forces BYOK even under next dev", () => {
    setNodeEnv("development");
    process.env.AI_JUDGE_MODE = "prod";
    process.env.OPENROUTER_API_KEY = "env-key-xxxx";
    resetEnvCache();
    expect(getAiJudgeMode()).toBe("prod");
    expect(resolveApiKey()).toBeNull();
    expect(hasServerKey()).toBe(false);
    expect(resolveApiKey("user-key")).toBe("user-key");
  });

  it("AI_JUDGE_MODE=dev allows env key even under NODE_ENV=production", () => {
    setNodeEnv("production");
    process.env.AI_JUDGE_MODE = "dev";
    process.env.OPENROUTER_API_KEY = "env-key-xxxx";
    resetEnvCache();
    expect(getAiJudgeMode()).toBe("dev");
    expect(resolveApiKey()).toBe("env-key-xxxx");
    expect(hasServerKey()).toBe(true);
  });

  it("accepts AI_JUDGE_MODE=production as an alias for prod", () => {
    process.env.AI_JUDGE_MODE = "production";
    resetEnvCache();
    expect(getAiJudgeMode()).toBe("prod");
  });
});

describe("getEnv allows missing OPENROUTER_API_KEY", () => {
  const prevKey = process.env.OPENROUTER_API_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = prevKey;
    resetEnvCache();
  });

  it("boots without a key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    resetEnvCache();
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    expect(env.OPENROUTER_API_KEY).toBe("");
    expect(env.OPENROUTER_BASE_URL.length).toBeGreaterThan(0);
    expect(() => new URL(env.OPENROUTER_BASE_URL)).not.toThrow();
  });
});
