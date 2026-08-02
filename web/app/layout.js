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
  "Dynasty and best ball fantasy football rankings, prospect grades, and season simulations — where the data reaches its endpoint.";

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
      </head>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
