"use client";

import { useEffect } from "react";
import { bindFeedback } from "@/feedback";

// Mounts the one delegated click listener that gives buttons and links
// their tap cue — see src/feedback. Lives in the root layout, renders null.
export function FeedbackBinder() {
  useEffect(() => bindFeedback(), []);
  return null;
}
