import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

// RTL only auto-cleans when test globals are enabled; we keep them off and clean up explicitly.
afterEach(cleanup);

// No network in tests: any fetch a test doesn't stub fails, as if the backend were down.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("No network in tests"))));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// jsdom has no <dialog> behaviour; real browsers are covered by Playwright.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// jsdom lacks PointerEvent; without it, pointer events lose clientX.
if (typeof window !== "undefined" && !("PointerEvent" in window)) {
  class PointerEventShim extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.assign(window, { PointerEvent: PointerEventShim });
}
