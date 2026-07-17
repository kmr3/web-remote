import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  title: "SwitchBot Home",
  description: "ローカルネットワーク用のSwitchBotリモコン",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#111315",
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
