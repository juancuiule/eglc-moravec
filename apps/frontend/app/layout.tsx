import { AuthBoot } from "@/auth/AuthBoot";
import { StoreBoot } from "@/storage/StoreBoot";
import { QueryProvider } from "@/providers/QueryProvider";
import type { Metadata } from "next";
import { Overpass_Mono } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const overpassMono = Overpass_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-overpass-mono",
});

export const metadata: Metadata = {
  title: "EGLC Moravec",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${overpassMono.variable}`}>
      <body className="min-h-dvh bg-base text-foreground font-sans">
        <QueryProvider>
          <AuthBoot />
          {/* Top-aligned rather than centered, paired with `panel`'s fixed max-width,
              so navigating between screens of different heights doesn't shift the surface. */}
          <main className="min-h-dvh flex items-start justify-center p-6 pt-12">
            <StoreBoot>{children}</StoreBoot>
          </main>
        </QueryProvider>
      </body>
    </html>
  );
}
