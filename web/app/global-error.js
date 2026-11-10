"use client";

// Last resort: the root layout itself failed, so none of the site's styles or fonts are loaded -- this page carries its own
// (the dark void and mint of the Europa palette, inline).
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0B0B0B", color: "#ECE7DC", fontFamily: "system-ui, sans-serif" }}>
        <title>Something went wrong — Dynasty Singularity</title>
        <main style={{ maxWidth: 440, padding: 24, textAlign: "center" }}>
          <p style={{ letterSpacing: "0.2em", fontSize: 12, color: "#E8643F", textTransform: "uppercase" }}>Dynasty Singularity</p>
          <h1 style={{ fontSize: 26, margin: "12px 0" }}>Something went wrong on our side.</h1>
          <p style={{ color: "#A39E92", lineHeight: 1.5 }}>The site couldn&apos;t load just now. Please try again in a moment.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: "10px 22px", background: "#E8643F", color: "#120804", border: 0, borderRadius: 2, fontWeight: 700, cursor: "pointer" }}
          >
            Try Again
          </button>
        </main>
      </body>
    </html>
  );
}
