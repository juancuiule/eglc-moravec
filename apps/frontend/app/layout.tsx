import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthBoot } from "@/auth/AuthBoot";
import { AppDatabaseProvider } from "@/db/AppDatabaseProvider";
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
          <AppDatabaseProvider>
            {/* Top-aligned rather than centered, paired with `panel`'s fixed max-width,
                so navigating between screens of different heights doesn't shift the surface. */}
            <div className="min-h-dvh flex items-start justify-center p-6 pt-12">{children}</div>
          </AppDatabaseProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
