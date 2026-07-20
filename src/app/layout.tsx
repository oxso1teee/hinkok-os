import type { Metadata } from "next";
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
