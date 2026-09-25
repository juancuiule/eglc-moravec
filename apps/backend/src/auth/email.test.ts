import { afterEach, expect, it, vi } from "vitest";
import { sendOtpEmail } from "./email.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("does not log recipient or OTP in development", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await sendOtpEmail("private@example.com", "123456", null);
  expect(JSON.stringify(log.mock.calls)).not.toContain("private@example.com");
  expect(JSON.stringify(log.mock.calls)).not.toContain("123456");
  expect(fetch).not.toHaveBeenCalled();
});

it("does not include provider response bodies in delivery errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "private@example.com 123456",
    }),
  );
  await expect(
    sendOtpEmail("private@example.com", "123456", "test-key"),
  ).rejects.toThrow(/^Resend request failed: 500$/);
});
