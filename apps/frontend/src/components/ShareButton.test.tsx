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

  render(<ShareButton payload={{ c: "1dx1d", n: 12, k: 10, ms: 4200 }} />);

  fireEvent.click(screen.getByRole("button", { name: "Share" }));

  await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  const url = writeText.mock.calls[0][0] as string;
  const payload = url.split("/share/")[1];
  expect(decodeSharePayload(payload)).toEqual({
    c: "1dx1d",
    n: 12,
    k: 10,
    ms: 4200,
  });
});
