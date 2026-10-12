import { Big_Shoulders, Overpass_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Tooltip from "./Tooltip";

// Display: Big Shoulders (condensed, scoreboard / jersey-number feel) for headings, the brand name and
// buttons. Body: Libron (a free OFL serif made for reading; files + license in app/fonts/) for paragraphs and
// labels. Mono: Overpass Mono for numbers, tables and small labels. Libron ships only Regular / Bold (+ italics),
// so CSS weights 500/600 resolve to those two.
// (Google merged "Big Shoulders Display" and "Big Shoulders Text" into one variable font, "Big Shoulders", whose
// optical-size axis gives the tall display cut at large sizes automatically.)
const display = Big_Shoulders({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["opsz"],
});

const body = localFont({
  variable: "--font-body",
  display: "swap",
  fallback: ["Georgia", "serif"],
  src: [
    { path: "./fonts/Libron-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/Libron-Italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/Libron-Bold.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Libron-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
});

const mono = Overpass_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const SITE_URL = "https://web-kohl-ten-94.vercel.app";
const TITLE = "Singularity Dynasty — Where the Data Reaches Its Endpoint";
const DESCRIPTION =
  "Weekly projection rankings, dynasty rankings, rookie prospect grades, and Monte Carlo season simulations for fantasy football — built on regression models, not gut feel.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Singularity Dynasty",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            try {
              var stored = localStorage.getItem('theme');
              if (stored === 'light' || stored === 'dark') {
                document.documentElement.setAttribute('data-theme', stored);
              }
            } catch (e) {}

          `}
        </Script>
        {/* Browsers auto-restore the previous scroll position on reload by
            default (history.scrollRestoration === "auto") -- a SEPARATE
            mechanism from the site's own hash-based scroll-to-section
            logic (InteractiveScript.js), and independent of any #hash in
            the URL at all: scrolling down and hitting refresh restores
            that position on its own, natively, before any of our own
            script runs. That's what was still landing a refresh on
            Tools/Pricing even after the hash-reload fix. Setting this to
            "manual" as early as possible (before hydration) hands scroll
            position entirely to our own logic instead, which already
            explicitly scrolls to 0,0 on a real reload. */}
        <Script id="scroll-restoration-manual" strategy="beforeInteractive">
          {`try { if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; } } catch (e) {}`}
        </Script>
      </head>
      <body>
        {children}
        <Tooltip />
        <Analytics />
      </body>
    </html>
  );
}
