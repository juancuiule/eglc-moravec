"use client";

import { useEffect } from "react";
import { panel, button } from "@/styles";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-base text-foreground font-sans">
        <main className="min-h-dvh flex items-start justify-center p-6 pt-12">
          <div className={`${panel} p-6 gap-4`}>
            <h1 className="text-xl font-bold tracking-tight">
              Something went wrong
            </h1>
            <p className="text-sm text-muted">
              The app hit an unexpected error and couldn't recover. Try
              reloading.
            </p>
            <button className={button({ intent: "primary" })} onClick={reset}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
