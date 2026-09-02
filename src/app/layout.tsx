import type { Metadata, Viewport } from "next";
import { Geist_Mono, Kosugi_Maru } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { StagingBanner } from "@/components/staging-banner";
import "./globals.css";

/** Google Fonts — 小杉丸（日本語 UI 向けの丸ゴシック） */
const kosugiMaru = Kosugi_Maru({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-kosugi-maru",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "シフト管理アプリ",
  description: "店舗のシフト作成・希望の受付・確定シフトの共有",
};

/** スマホ・タブレット向け: セーフエリア・ピンチズーム許可など */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fdf4ff" },
    { media: "(prefers-color-scheme: dark)", color: "#18181b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${kosugiMaru.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-dvh flex flex-col bg-gradient-to-br from-pink-50/50 via-purple-50/30 to-sky-50/50">
        <StagingBanner />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
