import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthBoot } from "@/auth/AuthBoot";
import { QueryProvider } from "@/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "EGLC Moravec",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-base text-foreground font-sans">
        <QueryProvider>
          <AuthBoot />
          {children}
        </QueryProvider>
      </body>
    </html>
  );
}
