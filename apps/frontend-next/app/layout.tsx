import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthBoot } from "@/auth/AuthBoot";
import "./globals.css";

export const metadata: Metadata = {
  title: "EGLC Moravec",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#0f0f13] text-[#e8e8f0] font-sans">
        <AuthBoot />
        {children}
      </body>
    </html>
  );
}
