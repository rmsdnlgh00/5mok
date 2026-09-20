import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "재료맨틀 - 재료로 음식 맞추기",
  description: "재료를 입력해서 오늘의 음식을 맞혀보세요",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
