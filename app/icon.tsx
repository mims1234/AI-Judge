import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Three-judge mark — used as the favicon. */
export default function Icon() {
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
            width: 22,
            height: 22,
            position: "relative",
          }}
        >
          <Dot top={0} left={6} />
          <Dot top={12} left={0} />
          <Dot top={12} left={12} />
        </div>
      </div>
    ),
    { ...size },
  );
}

function Dot({ top, left }: { top: number; left: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width: 8,
        height: 8,
        borderRadius: 999,
        background: "#2dd4bf",
      }}
    />
  );
}
