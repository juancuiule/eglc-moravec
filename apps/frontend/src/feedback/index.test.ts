import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  trigger: vi.fn(() => Promise.resolve()),
}));

vi.mock("cuelume", () => ({ play: mocks.play }));
vi.mock("web-haptics", () => ({
  WebHaptics: class {
    trigger = mocks.trigger;
  },
}));

// The module caches the enabled flag at first read — reset the module
// registry and re-import so each test starts from a cold cache.
async function load() {
  return await import("./index");
}

beforeEach(() => {
  vi.resetModules();
  mocks.play.mockClear();
  mocks.trigger.mockClear();
  localStorage.clear();
});

test("a digit key plays the tick cue and a short haptic pulse", async () => {
  const { feedback } = await load();

  feedback.key("5");

  expect(mocks.play).toHaveBeenCalledWith("tick");
  expect(mocks.trigger).toHaveBeenCalledWith(10);
});

test("⌫ and C play the duller press variant", async () => {
  const { feedback } = await load();

  feedback.key("⌫");
  feedback.key("C");

  expect(mocks.play).toHaveBeenNthCalledWith(1, "press");
  expect(mocks.play).toHaveBeenNthCalledWith(2, "press");
  expect(mocks.trigger).toHaveBeenCalledTimes(2);
});

test("success and error play their cue and matching haptic preset", async () => {
  const { feedback } = await load();

  feedback.success();
  feedback.error();

  expect(mocks.play).toHaveBeenNthCalledWith(1, "success");
  expect(mocks.play).toHaveBeenNthCalledWith(2, "error");
  expect(mocks.trigger).toHaveBeenNthCalledWith(1, "success");
  expect(mocks.trigger).toHaveBeenNthCalledWith(2, "error");
});

test("disabled feedback makes every cue a no-op — sound and haptics both", async () => {
  const { feedback, setFeedbackEnabled } = await load();

  setFeedbackEnabled(false);
  feedback.key("5");
  feedback.success();
  feedback.error();

  expect(mocks.play).not.toHaveBeenCalled();
  expect(mocks.trigger).not.toHaveBeenCalled();
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
