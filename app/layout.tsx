import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "森林星币站",
  description: "儿童学习习惯培养与星币奖励系统"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
