import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { getAuthEnv } from "@/env/server";
import "./globals.css";

/*
 * The brand sans (also used by the OG card). Self-hosted latin subset so
 * production builds never depend on a font CDN fetch.
 */
const inter = localFont({
  display: "swap",
  src: [
    { path: "./fonts/inter-400-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter-500-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter-600-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/inter-700-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/inter-800-latin.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(getAuthEnv().BETTER_AUTH_URL),
  title: "Transcriptly — Turn YouTube into a knowledge base",
  description:
    "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html className={inter.variable} lang="en">
      <body className="min-h-screen bg-[#fffdf8] font-sans text-[#202124] antialiased">
        {children}
      </body>
    </html>
  );
}
