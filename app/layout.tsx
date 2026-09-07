import { AmplitudeIdentity } from "@/components/app/amplitude-identity";
import { PerformanceObserver } from "@/components/app/performance-observer";
import { GoogleAnalytics } from "@/components/app/google-analytics";
import { NativeSessionBridge } from "@/components/app/native-session-bridge";
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "육아벨",
  description: "워킹맘/워킹대디를 위한 육아 정보·기록·AI 챗봇",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full bg-linear-to-br from-[#f1eaff] via-[#e8eeff] to-[#dff4ff] font-sans text-gray-800">
        <NativeSessionBridge />
        <AmplitudeIdentity />
        <PerformanceObserver />
        <GoogleAnalytics />
        {/* 모바일 frame — 태블릿/데스크탑에서는 가운데 정렬된 모바일 폭(430px)으로 표시 */}
        <div className="mx-auto flex min-h-dvh w-full max-w-107.5 flex-col bg-white shadow-[0_8px_40px_rgba(60,40,120,0.12)]">
          {children}
        </div>
      </body>
    </html>
  );
}
