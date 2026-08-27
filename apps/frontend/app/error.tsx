"use client";

import { useEffect } from "react";
import Link from "next/link";
import { panel, button, linkButton } from "@/styles";

export default function Error({
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
    <div className={`${panel} p-6 gap-4`}>
      <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted">
        This screen hit an unexpected error. You can try again, or head back to the menu.
      </p>
      <div className="flex flex-col gap-2">
        <button className={button({ intent: "primary" })} onClick={reset}>
          Try again
        </button>
        <Link href="/" className={linkButton({ intent: "ghost" })}>
          Back to menu
        </Link>
      </div>
    </div>
  );
}
