import { ImageResponse } from "next/og";
import { MarkSvg } from "@/lib/markSvg";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ECE7DC" }}>
        <MarkSvg size={160} ink="#0B0B0B" ember="#C8401E" bold={1.3} />
      </div>
    ),
    { ...size }
  );
}
