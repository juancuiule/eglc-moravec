import type { ReactNode } from "react";

export function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh flex items-center justify-center p-6">{children}</div>;
}
