import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { site, SITE_URL } from "@/lib/site";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: site.title,
  description: site.description,
  keywords: [
    "quick notes",
    "browser notes",
    "offline notes",
    "private notes",
    "chrome extension",
    "edge extension",
  ],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: site.name,
    title: site.title,
    description: site.description,
    images: [
      {
        url: "/assets/quick-notes/screenshot-1.png",
        width: 1280,
        height: 800,
        alt: "Quick Notes extension interface",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: ["/assets/quick-notes/screenshot-1.png"],
  },
  icons: {
    icon: "/assets/quick-notes/icon.png",
    apple: "/assets/quick-notes/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
