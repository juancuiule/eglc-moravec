import { expect, test } from "vitest";
import { randomId } from "./randomId";

const V4_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("produces a valid v4 UUID", () => {
  expect(randomId()).toMatch(V4_UUID);
});

test("is different on every call", () => {
  expect(randomId()).not.toBe(randomId());
});
