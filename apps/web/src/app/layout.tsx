import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ContextPilot",
  description: "Teams discovery ingestion, summarization, and quoting evidence workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,700;12..96,800&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Browser extensions (e.g. Grammarly) inject attributes onto <body> before
          React hydrates; suppress the resulting attribute-mismatch warning. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
