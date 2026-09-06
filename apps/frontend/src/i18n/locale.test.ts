import { describe, it, expect } from "vitest";
import { localeFromAcceptLanguage } from "./locale";

describe("localeFromAcceptLanguage", () => {
  it("defaults to en when there's no header", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
  });

  it("picks the first supported locale when there's no q weighting", () => {
    expect(localeFromAcceptLanguage("fr,es,en")).toBe("es");
  });

  it("ranks by q weight, not header list order", () => {
    expect(localeFromAcceptLanguage("es;q=0.3,en;q=0.9")).toBe("en");
  });

  it("treats an entry with no q param as q=1", () => {
    expect(localeFromAcceptLanguage("es;q=0.9,en")).toBe("en");
  });

  it("falls back to default when nothing is supported", () => {
    expect(localeFromAcceptLanguage("fr-FR,de;q=0.9")).toBe("en");
  });
});
