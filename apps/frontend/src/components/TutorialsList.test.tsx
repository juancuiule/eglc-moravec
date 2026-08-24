import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TutorialsList } from "./TutorialsList";

test("links to all six tutorial topics, each with its subtitle", () => {
  render(<TutorialsList />);

  expect(screen.getByRole("link", { name: /Addition/ }).getAttribute("href")).toBe(
    "/tutorial/addition",
  );
  expect(screen.getByRole("link", { name: /Multiplication/ }).getAttribute("href")).toBe(
    "/tutorial/multiplication",
  );
  expect(screen.getByRole("link", { name: /Squaring \(2 digits\)/ }).getAttribute("href")).toBe(
    "/tutorial/squaring2d",
  );
  expect(screen.getByRole("link", { name: /Squaring \(3 digits\)/ }).getAttribute("href")).toBe(
    "/tutorial/squaring3d",
  );
  expect(screen.getByRole("link", { name: /Squaring \(4 digits\)/ }).getAttribute("href")).toBe(
    "/tutorial/squaring4d",
  );
  expect(screen.getByRole("link", { name: /Major System/ }).getAttribute("href")).toBe(
    "/tutorial/majorSystem",
  );

  expect(screen.getByText("Master 4-digit squares")).toBeDefined();
});
