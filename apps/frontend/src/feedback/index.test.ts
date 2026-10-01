import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  setTheme: vi.fn(),
}));

vi.mock("cuelume", () => ({ play: mocks.play, setTheme: mocks.setTheme }));

// The module caches the enabled flag at first read — reset the module
// registry and re-import so each test starts from a cold cache.
async function load() {
  return await import("./index");
}

beforeEach(() => {
  vi.resetModules();
  mocks.play.mockClear();
  mocks.setTheme.mockClear();
  localStorage.clear();
});

test("a digit key plays the tap cue", async () => {
  const { feedback } = await load();

  feedback.key("5");

  expect(mocks.play).toHaveBeenCalledWith("tap");
});

test("⌫ and C play the close cue", async () => {
  const { feedback } = await load();

  feedback.key("⌫");
  feedback.key("C");

  expect(mocks.play).toHaveBeenNthCalledWith(1, "close");
  expect(mocks.play).toHaveBeenNthCalledWith(2, "close");
});

test("success and error play their cues", async () => {
  const { feedback } = await load();

  feedback.success();
  feedback.error();

  expect(mocks.play).toHaveBeenNthCalledWith(1, "success");
  expect(mocks.play).toHaveBeenNthCalledWith(2, "error");
});

test("disabled feedback makes every cue a no-op", async () => {
  const { feedback, setFeedbackEnabled } = await load();

  setFeedbackEnabled(false);
  feedback.key("5");
  feedback.select();
  feedback.success();
  feedback.error();

  expect(mocks.play).not.toHaveBeenCalled();
  expect(localStorage.getItem("moravec:sound")).toBe("off");
});

test("a stored 'off' survives reloads — a fresh module reads it disabled", async () => {
  localStorage.setItem("moravec:sound", "off");

  const { isFeedbackEnabled, feedback } = await load();

  expect(isFeedbackEnabled()).toBe(false);
  feedback.key("5");
  expect(mocks.play).not.toHaveBeenCalled();
});

test("enabled by default — anything but a stored 'off' means on", async () => {
  const { isFeedbackEnabled } = await load();
  expect(isFeedbackEnabled()).toBe(true);
});

test("importing the module switches all cues to the bubble theme", async () => {
  await load();

  expect(mocks.setTheme).toHaveBeenCalledWith("bubble");
});

test("select plays the select cue", async () => {
  const { feedback } = await load();

  feedback.select();

  expect(mocks.play).toHaveBeenCalledWith("select");
});
