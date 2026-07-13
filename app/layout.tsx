import type { Metadata, Viewport } from "next";
import "animal-island-ui/style";
import "./globals.css";
import { PwaRegister } from "@/app/pwa-register";
import { NotificationHost } from "@/app/notification-host";
import { InteractionShell } from "@/app/interaction-shell";

export const metadata: Metadata = {
  title: { default: "家庭星币成长站", template: "%s｜家庭星币成长站" },
  description: "把家庭约定变成清晰、温和、可持续的日常习惯。",
  applicationName: "家庭星币成长站",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false, nocache: true }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f7d63"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <InteractionShell>
          <a className="skip-link" href="#main-content">跳到主要内容</a>
          {children}
          <NotificationHost />
          <PwaRegister />
        </InteractionShell>
      </body>
    </html>
  );
}
