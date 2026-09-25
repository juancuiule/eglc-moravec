import { describe, expect, it } from "vitest";
import { SUPPORTED_CATEGORY_CODENAMES } from "engine";
import { CATEGORY_LABELS } from "./categoryLabels";

describe("CATEGORY_LABELS", () => {
  it("labels every category the engine can generate", () => {
    for (const codename of SUPPORTED_CATEGORY_CODENAMES) {
      expect(CATEGORY_LABELS[codename], codename).toBeTruthy();
    }
  });
});
