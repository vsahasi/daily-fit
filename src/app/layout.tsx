import type { Metadata } from "next";
import { Instrument_Sans, Libre_Caslon_Text } from "next/font/google";
import "./globals.css";

const ui = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const display = Libre_Caslon_Text({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Daily Fit",
  description: "A look from your closet, for the weather where you are.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Daily Fit",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">{children}</body>
    </html>
  );
}
