import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Teams Discovery Observer",
  description: "Teams discovery ingestion, summarization, and quoting evidence workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
