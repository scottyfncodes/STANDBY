import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c1a24", position: "relative" }}>
        <div style={{ position: "absolute", left: 104, top: 44, width: 46, height: 46, borderRadius: 46, background: "#e9a23b" }} />
        <div style={{ position: "absolute", left: 22, top: 132, width: 136, height: 5, borderRadius: 3, background: "#f5f0e6", opacity: 0.4 }} />
        <div style={{ position: "absolute", left: 22, top: 110, display: "flex", gap: 12 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: 8, background: "#f5f0e6", marginTop: -i * 6 + (i > 4 ? (i - 4) * 10 : 0) }} />
          ))}
        </div>
      </div>
    ),
    size,
  );
}
