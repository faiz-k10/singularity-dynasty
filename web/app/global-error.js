"use client";

// Last resort: the root layout itself failed, so none of the site's styles or fonts are loaded -- this page carries its own
// (the dark void and mint of the Europa palette, inline).
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#030908", color: "#E6F4F1", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong — Singularity Dynasty</title>
        <main style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.2em", fontSize: 12, color: "#2DD4BF", textTransform: "uppercase" }}>Singularity Dynasty</p>
          <h1 style={{ fontSize: 26, margin: "12px 0" }}>Something went wrong on our side.</h1>
          <p style={{ color: "#8C95A3", lineHeight: 1.5 }}>The site couldn&apos;t load just now. Please try again in a moment.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: "10px 22px", background: "#2DD4BF", color: "#021210", border: 0, borderRadius: 2, fontWeight: 700, cursor: "pointer" }}
          >
            Try Again
          </button>
        </main>
      </body>
    </html>
  );
}
