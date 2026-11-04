import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const description =
  "Turn bank and credit card statements (PDF, CSV or scans) into one clean table, with plain-English summaries and charts. Free, open source, and it runs in your browser: nothing is uploaded.";

export const metadata: Metadata = {
  // Origin only: Next.js adds the base path (/statement-processor) to generated URLs itself.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Statement Processor — read bank and card statements privately",
  description,
  applicationName: "Statement Processor",
  openGraph: {
    type: "website",
    siteName: "Statement Processor",
    title: "Statement Processor",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Statement Processor",
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
