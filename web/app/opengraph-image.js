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
          background: "#07070C",
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
              "radial-gradient(circle, rgba(255,122,69,0.35) 0%, rgba(255,122,69,0.10) 40%, rgba(255,122,69,0) 70%)",
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
              "radial-gradient(circle, rgba(61,220,255,0.28) 0%, rgba(61,220,255,0.08) 40%, rgba(61,220,255,0) 70%)",
          }}
        />

        <div
          style={{
            display: "flex",
            letterSpacing: 6,
            fontSize: 22,
            color: "#FFC773",
            marginBottom: 28,
          }}
        >
          DYNASTY · BEST BALL · DATA GRAVITY
        </div>

        <div
          style={{
            display: "flex",
            width: 96,
            height: 96,
            borderRadius: "50%",
            marginBottom: 28,
            background:
              "radial-gradient(circle at 35% 35%, #FFC773, #FF7A45 45%, #1F8FB0 85%)",
          }}
        />

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: "#F5F3EE",
            marginBottom: 22,
          }}
        >
          Singularity Dynasty
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#9997A8",
          }}
        >
          Where the data reaches its endpoint.
        </div>
      </div>
    ),
    { ...size }
  );
}
