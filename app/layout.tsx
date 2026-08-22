import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Money",
  description: "Personal finance tracking app",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className="min-h-screen bg-background font-sans antialiased"
        data-nonce={nonce ? "active" : undefined}
      >
        {children}
      </body>
    </html>
  );
}
