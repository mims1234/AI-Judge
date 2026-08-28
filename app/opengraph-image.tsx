import { ImageResponse } from "next/og";

export const alt = "AI Judge — Blind 3-Judge LLM Benchmark Lab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Discord / Slack / Twitter card — lab instrument look, teal on ink. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#070b0f",
          padding: "56px 64px",
          borderBottom: "8px solid #2dd4bf",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#2dd4bf",
              marginRight: 14,
            }}
          />
          <div
            style={{
              color: "#2dd4bf",
              fontSize: 22,
              letterSpacing: "0.28em",
              textTransform: "uppercase",
            }}
          >
            Benchmark lab
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", width: 760 }}>
            <div
              style={{
                color: "#e8f1f5",
                fontSize: 88,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                lineHeight: 1,
                fontWeight: 700,
              }}
            >
              AI Judge
            </div>
            <div
              style={{
                color: "#a9bcc9",
                fontSize: 30,
                lineHeight: 1.4,
                marginTop: 22,
              }}
            >
              One bundle. Three independent judges. Reproducible rankings.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 220,
              height: 220,
              border: "1px solid #24384a",
              background: "#0b1117",
              borderRadius: 12,
            }}
          >
            <div style={{ display: "flex", gap: 28 }}>
              <JudgeDot label="J1" />
              <JudgeDot label="J2" />
            </div>
            <div style={{ display: "flex", marginTop: 22 }}>
              <JudgeDot label="J3" />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <Pill>Blind panels</Pill>
          <Pill>Temperature 0</Pill>
          <Pill>Validators first</Pill>
          <Pill>ai-judge.genxmims.org</Pill>
        </div>
      </div>
    ),
    { ...size },
  );
}

function JudgeDot({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 56,
        height: 56,
        borderRadius: 999,
        border: "2px solid #2dd4bf",
        color: "#5eead4",
        fontSize: 18,
        letterSpacing: "0.04em",
      }}
    >
      {label}
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        border: "1px solid #24384a",
        background: "#0b1117",
        color: "#a9bcc9",
        fontSize: 20,
        padding: "10px 16px",
        borderRadius: 8,
      }}
    >
      {children}
    </div>
  );
}
