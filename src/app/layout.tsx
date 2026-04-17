import type { Metadata } from "next";
import { Geist_Mono, Kosugi_Maru } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
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
  description: "ガールズバー7店舗のシフト管理システム",
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
      <body className="min-h-full flex flex-col bg-gradient-to-br from-pink-50/50 via-purple-50/30 to-sky-50/50">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
