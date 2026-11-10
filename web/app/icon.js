import { ImageResponse } from "next/og";
import { MarkSvg } from "@/lib/markSvg";

// 64px so it is sharp on a retina tab bar (browsers scale it down to 16 / 32).
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// The full logo (lib/brandMark.js) on the bone paper: the disc with the football in it, the ember line and its little ball; the line is a little
// heavier than in the header so it holds up at tab size.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ECE7DC" }}>
        <MarkSvg size={64} ink="#0B0B0B" ember="#C8401E" bg="#ECE7DC" bold={1.4} />
      </div>
    ),
    { ...size }
  );
}
