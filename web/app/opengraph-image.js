import { ImageResponse } from "next/og";
import { MarkSvg } from "@/lib/markSvg";

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
          background: "#ECE7DC",
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
              "radial-gradient(circle, rgba(17,17,17,0.24) 0%, rgba(17,17,17,0.07) 40%, rgba(17,17,17,0) 70%)",
          }}
        />

        <div
          style={{
            display: "flex",
            letterSpacing: 6,
            fontSize: 22,
            color: "#C8401E",
            marginBottom: 28,
          }}
        >
          DYNASTY · DATA GRAVITY
        </div>

        <div style={{ display: "flex", marginBottom: 28 }}>
          <MarkSvg size={130} ink="#0B0B0B" ember="#C8401E" bg="#ECE7DC" bold={0.8} />
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: "#121212",
            marginBottom: 22,
          }}
        >
          Singularity Dynasty
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 32,
            color: "#5C5850",
          }}
        >
          Where the data reaches its endpoint.
        </div>
      </div>
    ),
    { ...size }
  );
}
