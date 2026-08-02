import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
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
