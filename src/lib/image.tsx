import { ImageResponse } from "next/og";
import { PROFILE } from "./profile";
import type { Visual } from "./visual";

// Square images get the most room in the LinkedIn feed.
const SIZE = 1200;

const C = {
  bg: "#0b1f33",
  bg2: "#12395e",
  text: "#ffffff",
  muted: "#a9c3dc",
  accent: "#4fb3ff",
  box: "#163f66",
  boxBorder: "#2f6fa8",
};

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: SIZE,
        height: SIZE,
        display: "flex",
        flexDirection: "column",
        padding: "80px 90px",
        color: C.text,
        backgroundImage: `linear-gradient(160deg, ${C.bg} 0%, ${C.bg2} 100%)`,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, color: C.accent, letterSpacing: 2, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1 }}>{children}</div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          paddingTop: 30,
          borderTop: `2px solid ${C.boxBorder}`,
          fontSize: 28,
          color: C.muted,
        }}
      >
        <span>{PROFILE.fullName}</span>
        <span>Follow for more</span>
      </div>
    </div>
  );
}

function Card({ visual }: { visual: Visual }) {
  return (
    <Frame label="Key takeaways">
      <div style={{ display: "flex", fontSize: 84, fontWeight: 700, lineHeight: 1.15 }}>{visual.title}</div>
      <div style={{ width: 120, height: 8, borderRadius: 4, background: C.accent, marginTop: 44 }} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: 60, gap: 52 }}>
        {visual.points.map((point, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 72,
                height: 72,
                flexShrink: 0,
                borderRadius: 36,
                background: C.accent,
                color: C.bg,
                fontSize: 38,
                fontWeight: 700,
              }}
            >
              {i + 1}
            </div>
            <div style={{ display: "flex", fontSize: 48, lineHeight: 1.3, marginTop: 4 }}>{point}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function Flowchart({ visual }: { visual: Visual }) {
  const n = visual.steps.length;
  const boxHeight = n > 5 ? 84 : 100;
  return (
    <Frame label="How it works">
      <div style={{ display: "flex", justifyContent: "center", textAlign: "center", fontSize: 58, fontWeight: 700, lineHeight: 1.15 }}>
        {visual.title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 40 }}>
        {visual.steps.map((step, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 22,
                width: 820,
                height: boxHeight,
                padding: "0 34px",
                borderRadius: 18,
                background: C.box,
                border: `3px solid ${C.boxBorder}`,
                fontSize: 38,
              }}
            >
              <span style={{ color: C.accent, fontWeight: 700 }}>{i + 1}</span>
              <span>{step}</span>
            </div>
            {i < n - 1 && (
              <svg width="32" height="40" viewBox="0 0 32 40" style={{ margin: "4px 0" }}>
                <rect x="14" y="0" width="4" height="24" fill={C.accent} />
                <polygon points="4,22 28,22 16,38" fill={C.accent} />
              </svg>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

// Returns PNG bytes for a card or flowchart image.
export async function renderImage(kind: "card" | "flowchart", visual: Visual): Promise<ArrayBuffer> {
  const element = kind === "flowchart" ? <Flowchart visual={visual} /> : <Card visual={visual} />;
  return new ImageResponse(element, { width: SIZE, height: SIZE }).arrayBuffer();
}
