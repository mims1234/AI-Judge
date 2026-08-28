import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070b0f",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 12,
            border: "4px solid #2dd4bf",
            alignItems: "center",
            justifyContent: "center",
            color: "#2dd4bf",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          AJ
        </div>
      </div>
    ),
    { ...size },
  );
}
