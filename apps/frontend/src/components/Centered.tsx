import type { ReactNode } from "react";

/**
 * Every page's outer shell: horizontally centered, pinned to the top rather
 * than vertically centered. Paired with `panel`'s fixed max-width, this is
 * what keeps navigating between screens of different heights (e.g. Level
 * play <-> Finished) from visibly shifting the surface up and down.
 */
export function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh flex items-start justify-center p-6 pt-12">{children}</div>;
}
