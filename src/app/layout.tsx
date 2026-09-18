import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Xpel POS — Xpel Beauty NG",
  description:
    "Offline-first point of sale, inventory and sales analytics for Xpel Beauty NG.",
  manifest: "/manifest.webmanifest",
  applicationName: "Xpel POS",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Xpel POS" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-256.png", sizes: "256x256" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#cf6d1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
