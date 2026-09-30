import { act } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { localStore, TRIALS_TABLE } from "@/local/store";
import { renderWithIntl } from "@/testUtils/renderWithIntl";
import { SyncChip } from "./SyncChip";

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

function addPending(n: number) {
  for (let i = 0; i < n; i++) {
    localStore.setRow(TRIALS_TABLE, `t:test-${i}`, {
      payload: "{}",
      synced: false,
    });
  }
}

beforeEach(() => {
  localStore.delTables();
  localStore.delValues();
  localStore.setValue("hydrated", true);
  setOnline(true);
});

test("hidden while online with an empty outbox", () => {
  const { container } = renderWithIntl(<SyncChip />);
  expect(container.firstChild).toBeNull();
});

test("online with unsynced rows shows the pending count", () => {
  addPending(3);
  renderWithIntl(<SyncChip />);
  expect(document.body.textContent).toContain("3 pending");
  expect(document.body.textContent).not.toContain("Offline");
});

test("offline shows the badge even before the count is known", () => {
  localStore.setValue("hydrated", false);
  setOnline(false);
  renderWithIntl(<SyncChip />);
  expect(document.body.textContent).toContain("Offline");
});

test("offline with pending rows shows both", () => {
  addPending(2);
  setOnline(false);
  renderWithIntl(<SyncChip />);
  expect(document.body.textContent).toContain("Offline");
  expect(document.body.textContent).toContain("2 pending");
});

test("reacts to online/offline events and to outbox writes", () => {
  renderWithIntl(<SyncChip />);
  act(() => setOnline(false));
  act(() => window.dispatchEvent(new Event("offline")));
  expect(document.body.textContent).toContain("Offline");

  act(() => addPending(1));
  expect(document.body.textContent).toContain("1 pending");

  act(() => setOnline(true));
  act(() => window.dispatchEvent(new Event("online")));
  expect(document.body.textContent).not.toContain("Offline");
  expect(document.body.textContent).toContain("1 pending");
});
