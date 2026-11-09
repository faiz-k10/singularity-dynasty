import { ImageResponse } from "next/og";
import { MarkSvg } from "@/lib/markSvg";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// The mark (lib/brandMark.js) on the bone paper, line and speck thickened for 32px.
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ECE7DC" }}>
        <MarkSvg size={32} ink="#0B0B0B" ember="#C8401E" bold={1.7} />
      </div>
    ),
    { ...size }
  );
}
