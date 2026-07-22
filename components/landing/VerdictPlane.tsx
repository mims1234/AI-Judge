"use client";

/**
 * Hero signal art (plans/08 §1.2): three judge nodes emitting score pulses
 * into a central median bar. CSS animation only; static under reduced motion.
 * Decorative — aria-hidden. Ink/line/teal only.
 */
export function VerdictPlane() {
  // Judge nodes at left; median bar at right. Pulses travel the three paths.
  const paths = [
    "M 52 60 C 160 60, 220 118, 306 142",
    "M 52 160 C 160 160, 220 160, 306 160",
    "M 52 260 C 160 260, 220 202, 306 178",
  ];

  return (
    <svg
      viewBox="0 0 420 320"
      className="h-auto w-full max-w-[420px]"
      aria-hidden="true"
      role="presentation"
    >
      {/* faint bench grid inside the plane */}
      <g stroke="var(--color-line-subtle)" strokeWidth="0.5" opacity="0.6">
        {Array.from({ length: 8 }, (_, i) => (
          <line key={`v${i}`} x1={30 + i * 48} y1="16" x2={30 + i * 48} y2="304" />
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <line key={`h${i}`} x1="16" y1={40 + i * 48} x2="404" y2={40 + i * 48} />
        ))}
      </g>

      {/* signal lines */}
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="var(--color-teal-400)"
          strokeWidth="1"
          opacity="0.35"
        />
      ))}

      {/* traveling pulses */}
      {paths.map((d, i) => (
        <circle key={`p${i}`} r="2.5" fill="var(--color-teal-400)">
          <animateMotion
            dur="4s"
            begin={`${i * 1.3}s`}
            repeatCount="indefinite"
            path={d}
          />
          <animate
            attributeName="opacity"
            values="0;0.9;0.9;0"
            keyTimes="0;0.15;0.85;1"
            dur="4s"
            begin={`${i * 1.3}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* judge nodes */}
      {[
        { y: 60, label: "J1" },
        { y: 160, label: "J2" },
        { y: 260, label: "J3" },
      ].map((n) => (
        <g key={n.label}>
          <circle
            cx="52"
            cy={n.y}
            r="17"
            fill="var(--color-ink-900)"
            stroke="var(--color-line-strong)"
            strokeWidth="1"
          />
          <circle cx="52" cy={n.y} r="17" fill="none" stroke="var(--color-teal-400)" strokeWidth="1" opacity="0.4" />
          <text
            x="52"
            y={n.y + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontFamily="var(--font-mono)"
            fill="var(--color-body)"
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* median bar */}
      <g>
        <rect
          x="306"
          y="120"
          width="14"
          height="80"
          rx="2"
          fill="var(--color-ink-900)"
          stroke="var(--color-line-strong)"
          strokeWidth="1"
        />
        <rect x="309" y="126" width="8" height="68" rx="1.5" fill="var(--color-ink-700)" />
        <rect
          x="309"
          y="126"
          width="8"
          height="68"
          rx="1.5"
          fill="var(--color-teal-500)"
          opacity="0.85"
        >
          <animate
            attributeName="height"
            values="46;58;52;61;46"
            dur="8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="y"
            values="148;136;142;133;148"
            dur="8s"
            repeatCount="indefinite"
          />
        </rect>
        {/* median tick */}
        <line x1="300" y1="160" x2="326" y2="160" stroke="var(--color-teal-400)" strokeWidth="1.5" />
        <text
          x="313"
          y="216"
          textAnchor="middle"
          fontSize="8"
          fontFamily="var(--font-mono)"
          fill="var(--color-dim)"
          letterSpacing="1"
        >
          MEDIAN
        </text>
      </g>
    </svg>
  );
}
