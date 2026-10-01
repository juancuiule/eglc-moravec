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
  document.body.innerHTML = "";
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

test("tap plays the pulse cue and a short haptic pulse", async () => {
  const { feedback } = await load();

  feedback.tap();

  expect(mocks.play).toHaveBeenCalledWith("pulse");
  expect(mocks.trigger).toHaveBeenCalledWith(10);
});

test("toggle plays the toggle cue and a short haptic pulse", async () => {
  const { feedback } = await load();

  feedback.toggle();

  expect(mocks.play).toHaveBeenCalledWith("toggle");
  expect(mocks.trigger).toHaveBeenCalledWith(10);
});

test("bindFeedback taps on a click anywhere inside a button or a link", async () => {
  const { bindFeedback } = await load();
  const unbind = bindFeedback();
  document.body.innerHTML = `
    <button id="b"><span id="s">hi</span></button>
    <a id="l" href="/x">go</a>`;

  document.getElementById("b")!.click();
  document.getElementById("s")!.click();
  document.getElementById("l")!.click();

  expect(mocks.play).toHaveBeenCalledTimes(3);
  expect(mocks.play).toHaveBeenCalledWith("pulse");
  unbind();
});

test("bindFeedback skips non-controls, opted-out controls, and disabled ones", async () => {
  const { bindFeedback } = await load();
  const unbind = bindFeedback();
  document.body.innerHTML = `
    <div id="d">plain</div>
    <div data-feedback="off"><button id="opt">x</button></div>
    <button id="dis" disabled>x</button>
    <button id="aria" aria-disabled="true">x</button>`;

  for (const id of ["d", "opt", "dis", "aria"])
    document.getElementById(id)!.click();

  expect(mocks.play).not.toHaveBeenCalled();
  expect(mocks.trigger).not.toHaveBeenCalled();
  unbind();
});

test("bindFeedback is silent while feedback is disabled", async () => {
  const { bindFeedback, setFeedbackEnabled } = await load();
  const unbind = bindFeedback();
  document.body.innerHTML = `<button id="b">x</button>`;
  setFeedbackEnabled(false);

  document.getElementById("b")!.click();

  expect(mocks.play).not.toHaveBeenCalled();
  unbind();
});

test("the returned unbind removes the listener", async () => {
  const { bindFeedback } = await load();
  const unbind = bindFeedback();
  document.body.innerHTML = `<button id="b">x</button>`;
  unbind();

  document.getElementById("b")!.click();

  expect(mocks.play).not.toHaveBeenCalled();
});
