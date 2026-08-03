import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrepLoop — Adaptive Study Planner",
  description: "วางแผนและติดตามการติวสอบแบบปรับตัวได้",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
