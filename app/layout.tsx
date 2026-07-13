import type { Metadata } from "next";
import "animal-island-ui/style";
import "./globals.css";

export const metadata: Metadata = {
  title: "森林星币站",
  description: "儿童学习习惯培养与星币奖励系统",
  icons: {
    icon: "/assets/gpt-image/icons/icon-brand-leaf-coin.png"
  },
  robots: {
    index: false,
    follow: false,
    nocache: true
  }
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
