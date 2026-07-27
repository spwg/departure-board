import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Departures — NJ Transit rail",
    template: "%s — Departures",
  },
  description:
    "A clean NJ Transit rail departure board: destinations, times, and tracks.",
  applicationName: "Departures",
  appleWebApp: {
    capable: true,
    title: "Departures",
    statusBarStyle: "default",
  },
  // Icons are picked up from app/icon.png, app/apple-icon.png, and
  // app/favicon.ico. Declaring them here would override that detection.
};

export const viewport: Viewport = {
  // Keeps the board flush to the edges on notched phones.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
