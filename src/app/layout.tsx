import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WebAppSetup } from "@/components/WebAppSetup";
export const metadata: Metadata = {
  title: "SMILE by Dr Vik — Cosmetic Dentistry Visualiser",
  description:
    "Visualise and discuss a potential cosmetic dentistry result with Dr Vik in London.",
  appleWebApp: { capable: true, title: "SMILE", statusBarStyle: "black-translucent" },
  other: { "apple-mobile-web-app-capable": "yes" },
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f5f7",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}<WebAppSetup /></body>
    </html>
  );
}
