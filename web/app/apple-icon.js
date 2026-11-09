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
          background: "#ECE7DC",
        }}
      >
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            display: "flex",
            background: "#0B0B0B",
            boxSizing: "border-box",
            border: "8px solid #E8643F",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
