import { fireEvent, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ShareButton } from "./ShareButton";
import { decodeSharePayload } from "../share/payload";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

test("copies a /share/<payload> URL carrying the result", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  render(<ShareButton payload={{ l: 12, n: 20, k: 18, ms: 55403 }} />);

  fireEvent.click(screen.getByRole("button", { name: "Share" }));

  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  const url = writeText.mock.calls[0][0] as string;
  const payload = url.split("/share/")[1];
  expect(decodeSharePayload(payload)).toEqual({
    l: 12,
    n: 20,
    k: 18,
    ms: 55403,
  });
});

test("is an icon-only button that announces the copy", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });

  render(<ShareButton payload={{ l: 1, n: 20, k: 20, ms: 1000 }} />);

  const button = screen.getByRole("button", { name: "Share" });
  expect(button.textContent).toBe("");
  expect(button.querySelector("svg")).not.toBeNull();

  fireEvent.click(button);

  await vi.waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("Link copied"),
  );
});
