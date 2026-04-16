import type { Metadata } from "next";
import { AppShell } from "@/frontend/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polymarket Copytrade Control Center",
  description: "Authorize wallets, monitor top Polymarket traders, manage copytrade tasks, and inspect TimesNet market analysis.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
