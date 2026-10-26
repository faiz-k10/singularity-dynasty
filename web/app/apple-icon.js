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
          background: "#030908",
        }}
      >
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            display: "flex",
            background:
              "radial-gradient(circle at 35% 35%, #5EEAD4, #2DD4BF 45%, #6B7480 85%)",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
