import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
import "./immersive.css";
import "./compact.css";
import "./brand.css";
import "./ios-layout.css";
import "./account.css";
import "./onboarding.css";
import "./settings.css";
import "./library.css";
import "./cases.css";
import "./materials.css";
import "./studio.css";
import { WebAppSetup } from "@/components/WebAppSetup";
import { AppProviders } from "@/components/AppProviders";
import { AppearanceController } from "@/components/AppearanceController";
import { APPEARANCE_BOOT_SCRIPT, THEME_COLORS } from "@/lib/appearance";
export const metadata: Metadata = {
  title: "SmileCompose | Digital Smile Design",
  description:
    "SmileCompose is a digital smile-design and visualisation tool created to help clinicians explore and communicate aesthetic treatment possibilities.",
  applicationName: "SmileCompose",
  metadataBase: new URL("https://smile-by-dr-vik.drvik.workers.dev"),
  openGraph: {
    title: "SmileCompose | Digital Smile Design",
    description: "SmileCompose is a digital smile-design and visualisation tool created to help clinicians explore and communicate aesthetic treatment possibilities.",
    siteName: "SmileCompose",
    type: "website",
    images: [{ url: "/brand/smilecompose-social.png", width: 1200, height: 630, alt: "SmileCompose — Smile design, visualised." }],
  },
  twitter: { card: "summary_large_image", title: "SmileCompose | Digital Smile Design", description: "SmileCompose is a digital smile-design and visualisation tool created to help clinicians explore and communicate aesthetic treatment possibilities.", images: ["/brand/smilecompose-social.png"] },
  appleWebApp: { capable: true, title: "SmileCompose", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/brand/favicon-32-glass-v2.png", sizes: "32x32", type: "image/png" }],
    apple: [
      { url: "/brand/apple-touch-icon-152-glass-v2.png", sizes: "152x152", type: "image/png" },
      { url: "/brand/apple-touch-icon-167-glass-v2.png", sizes: "167x167", type: "image/png" },
      { url: "/brand/apple-touch-icon-glass-v2.png", sizes: "180x180", type: "image/png" },
    ],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Resolve Light/Dark before first paint (Settings › Appearance, else the system). */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_BOOT_SCRIPT }} />
      </head>
      <body><AppearanceController /><AppProviders>{children}</AppProviders><WebAppSetup /></body>
    </html>
  );
}
