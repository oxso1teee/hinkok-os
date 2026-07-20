import type { Metadata, Viewport } from "next";

import { ServiceWorkerRegistration } from "@/components/ui/service-worker-registration";
import "./globals.css";
import "./crm.css";
import "./brain.css";
import "./journal.css";
import "./health.css";
import "./operations.css";
import "./settings.css";
import "./backup.css";

export const metadata: Metadata = {
  title: {
    default: "HinkoK OS",
    template: "%s | HinkoK OS",
  },
  description: "Personal AI operating system",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "HinkoK OS",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#160a06",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
