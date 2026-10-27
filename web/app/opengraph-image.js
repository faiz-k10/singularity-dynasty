import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#030908",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -180,
            right: -160,
            width: 640,
            height: 640,
            borderRadius: "50%",
            display: "flex",
            background:
              "radial-gradient(circle, rgba(45,212,191,0.30) 0%, rgba(45,212,191,0.09) 40%, rgba(45,212,191,0) 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -220,
            left: -200,
            width: 620,
            height: 620,
            borderRadius: "50%",
            display: "flex",
            background:
              "radial-gradient(circle, rgba(140,149,163,0.24) 0%, rgba(140,149,163,0.07) 40%, rgba(140,149,163,0) 70%)",
          }}
        />

        <div
          style={{
            display: "flex",
            letterSpacing: 6,
            fontSize: 22,
            color: "#2DD4BF",
            marginBottom: 28,
          }}
        >
          DYNASTY · DATA GRAVITY
        </div>

        <div
          style={{
            display: "flex",
            width: 96,
            height: 96,
            borderRadius: "50%",
            marginBottom: 28,
            background:
              "radial-gradient(circle at 35% 35%, #5EEAD4, #2DD4BF 45%, #E11D48 85%)",
          }}
        />

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: "#E6F4F1",
            marginBottom: 22,
          }}
        >
          Singularity Dynasty
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#8C95A3",
          }}
        >
          Where the data reaches its endpoint.
        </div>
      </div>
    ),
    { ...size }
  );
}
