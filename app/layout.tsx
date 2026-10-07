import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruang STEM — Belajar lewat praktik",
  description:
    "Belajar STEM melalui materi, praktikum, latihan kode, dan pendampingan mentor.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
