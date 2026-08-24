import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { TutorialsList } from "./TutorialsList";

test("links to the addition, multiplication, and squaring tutorials", () => {
  render(<TutorialsList />);

  expect(screen.getByRole("link", { name: /Addition/ }).getAttribute("href")).toBe(
    "/tutorial/addition",
  );
  expect(screen.getByRole("link", { name: /Multiplication/ }).getAttribute("href")).toBe(
    "/tutorial/multiplication",
  );
  expect(screen.getByRole("link", { name: /Squaring/ }).getAttribute("href")).toBe(
    "/tutorial/squaring",
  );
  expect(screen.getByRole("link", { name: /Major System/ }).getAttribute("href")).toBe(
    "/tutorial/majorSystem",
  );
});
