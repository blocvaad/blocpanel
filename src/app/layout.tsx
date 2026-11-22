import type { Metadata } from "next";
import "./globals.css";
import RegisterSW from "@/components/layout/RegisterSW";

export const metadata: Metadata = {
  title: "blocpanel",
  description: "Super Admin Dashboard",
  robots: "noindex, nofollow",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "blocpanel",
  },
  // MOD-1 (MG-S1177): הלוגו של הפאנל גם בלשונית (SVG), ואייקוני ה-PWA מ-21/11. במפורש כאן — קובץ icon בתיקיית app לא היה נכנס
  // כש-icons מוגדר.
  icons: {
    icon: [{ url: "/panel-logo.svg", type: "image/svg+xml" }, { url: "/icon-panel-192.png", sizes: "192x192", type: "image/png" }],
    apple: { url: "/icon-panel-180.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <meta name="theme-color" content="#09090b" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
