import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { getAuthEnv } from "@/env/server";
import "./globals.css";

/*
 * Site-wide font system, loaded through next/font/google so every route
 * ships the same faces without a runtime CDN fetch:
 *
 * - Inter (--font-sans): body copy and product UI.
 * - Fraunces (--font-serif): page and section display headings.
 * - JetBrains Mono (--font-mono): code, timestamps, and technical labels.
 *
 * Fraunces keeps its optical-size axis so large display headings settle into
 * their true display cut while inline uses stay quiet.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700", "800"],
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  axes: ["opsz"],
  weight: "variable",
  style: ["normal", "italic"],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getAuthEnv().BETTER_AUTH_URL),
  title: "Transcriptly — Turn YouTube into a knowledge base",
  description:
    "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
  icons: {
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${inter.variable} ${fraunces.variable} ${jetBrainsMono.variable}`}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <body className="min-h-screen bg-[#fffdf8] font-sans text-[#202124] antialiased">
        {children}
      </body>
    </html>
  );
}
