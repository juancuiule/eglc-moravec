import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, vi, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OtpForm } from "./OtpForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/sync/syncEngine", () => ({ sync: vi.fn(), resetCursor: vi.fn() }));

import { Api } from "@/api/Api";
import { sync, resetCursor } from "@/sync/syncEngine";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OtpForm email="player@example.com" />
    </QueryClientProvider>,
  );
}

// Regression test for #30: the code input must have a real accessible
// name (a placeholder alone doesn't count) and the right autocomplete hint.
test("the code input has an accessible name and autocomplete", () => {
  renderForm();

  const input = screen.getByLabelText("6-digit code");
  expect(input.getAttribute("autocomplete")).toBe("one-time-code");
});

test("flushes any still-unsynced trials under the new token right after a successful verification", async () => {
  vi.spyOn(Api, "verifyOtp").mockResolvedValue({ token: "tok123", expiresAt: 0 });
  renderForm();

  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));

  await waitFor(() =>
    expect(sync).toHaveBeenCalledWith({ type: "loggedIn", token: "tok123", email: "player@example.com" }),
  );
});

test("resets the sync cursor before flushing on login — sync_log.seq is global, not per-user, so a stale cursor can skip a merged account's prior history", async () => {
  vi.spyOn(Api, "verifyOtp").mockResolvedValue({ token: "tok123", expiresAt: 0 });
  renderForm();

  fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Verify" }));

  await waitFor(() => expect(sync).toHaveBeenCalled());
  expect(resetCursor).toHaveBeenCalled();
  expect(vi.mocked(resetCursor).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(sync).mock.invocationCallOrder[0],
  );
});
