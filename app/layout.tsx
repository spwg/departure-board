import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { RetiredWatchStateCleanup } from "@/components/RetiredWatchStateCleanup";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ThemeSync } from "@/components/ThemeSync";
import { THEME_COLORS, themeScript } from "@/lib/theme";
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
    "A clean departure board for NJ Transit rail and the NYC Subway: destinations, times, and tracks.",
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
    // Follows the OS; a theme chosen in Settings overrides these (lib/theme.ts).
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
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
      // The theme script sets data-theme before React hydrates.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <RetiredWatchStateCleanup />
        <ServiceWorkerRegistrar />
        <ThemeSync />
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
