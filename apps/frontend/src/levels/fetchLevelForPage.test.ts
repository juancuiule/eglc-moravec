import { beforeEach, expect, test, vi } from "vitest";
import { fetchLevelForPage } from "./fetchLevelForPage";

vi.mock("../api/Api", () => ({
  Api: { fetchLevel: vi.fn() },
}));

import { Api } from "../api/Api";

beforeEach(() => {
  vi.mocked(Api.fetchLevel).mockReset();
});

test("returns found with the mix on a successful fetch", async () => {
  vi.mocked(Api.fetchLevel).mockResolvedValue({ addition: 100 });

  expect(await fetchLevelForPage(1)).toEqual({ status: "found", mix: { addition: 100 } });
});

test("returns not-found when the backend says the Level doesn't exist", async () => {
  vi.mocked(Api.fetchLevel).mockResolvedValue(null);

  expect(await fetchLevelForPage(999)).toEqual({ status: "not-found" });
});

test("returns unreachable, not a thrown error, when the fetch itself fails", async () => {
  vi.mocked(Api.fetchLevel).mockRejectedValue(new Error("backend unreachable"));

  expect(await fetchLevelForPage(1)).toEqual({ status: "unreachable" });
});
