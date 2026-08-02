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
          background: "#07070C",
        }}
      >
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            display: "flex",
            background:
              "radial-gradient(circle at 35% 35%, #FFC773, #FF7A45 45%, #1F8FB0 85%)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
