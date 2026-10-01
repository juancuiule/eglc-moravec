import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { SiteCredit } from "./SiteCredit";
import { renderWithIntl as render } from "@/testUtils/renderWithIntl";

test("credits the web version's author and El Gato y La Caja with links", () => {
  render(<SiteCredit />);

  const footer = screen.getByRole("contentinfo");
  expect(footer.textContent).toBe(
    "Web version - developed by @juancuiule from @elgatoylacaja",
  );
  expect(
    screen.getByRole("link", { name: "@juancuiule" }).getAttribute("href"),
  ).toBe("https://github.com/juancuiule");
  expect(
    screen.getByRole("link", { name: "@elgatoylacaja" }).getAttribute("href"),
  ).toBe("https://elgatoylacaja.com/");
});
