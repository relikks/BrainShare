import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "BrainShare",
  description: "A multi-modal knowledge drive with natural-language search.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      className={`${inter.variable} h-full font-sans antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh overscroll-none">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
