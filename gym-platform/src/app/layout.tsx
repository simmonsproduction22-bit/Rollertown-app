import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "[ProductName]: gym software for martial arts", template: "%s · [ProductName]" },
  description: "Schedule, privates, memberships, belts, fight team, payments and refunds that work. One price, no add-ons.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#0a0a0c", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-brand focus:px-3 focus:py-2 focus:text-brand-fg">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
