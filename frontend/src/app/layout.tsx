import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.scss";

export const metadata: Metadata = {
  title: "名刺管理",
  description: "名刺・連絡先管理アプリケーション",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
