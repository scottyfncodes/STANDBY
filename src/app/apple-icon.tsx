import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same mark as icon.svg, full-bleed: iOS applies its own corner mask.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#10202b"/><circle cx="46" cy="22" r="11" fill="#e9a23b" fill-opacity=".18"/><circle cx="46" cy="22" r="6" fill="#e9a23b"/><path d="M12 46C20 34 28 27 37 24" stroke="#f4f0e8" stroke-width="3.2" stroke-linecap="round" stroke-dasharray=".1 6.2" fill="none"/><path d="M12 51h40" stroke="#f4f0e8" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/></svg>`;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex" }}>
        <img src={`data:image/svg+xml;base64,${Buffer.from(MARK).toString("base64")}`} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
