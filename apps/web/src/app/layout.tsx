import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getAuthEnv } from "@/env/server";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(getAuthEnv().BETTER_AUTH_URL),
  title: "Transcriptly — Turn YouTube into a knowledge base",
  description:
    "Capture YouTube transcripts in batch and keep them locally as portable Markdown.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 font-sans text-zinc-950 antialiased dark:bg-zinc-950 dark:text-zinc-50">
        {children}
      </body>
    </html>
  );
}
