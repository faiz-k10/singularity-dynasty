import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
      className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}
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
        <Analytics />
      </body>
    </html>
  );
}
