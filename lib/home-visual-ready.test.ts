import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForHomeVisuals } from "./home-visual-ready";

test("home readiness waits for viewport image decode and fonts, ignores offscreen images", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  let release!: () => void;
  const decode = new Promise<void>((resolve) => {
    release = resolve;
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      fonts: { ready: Promise.resolve() },
      images: [
        {
          getBoundingClientRect: () => ({
            width: 1,
            height: 1,
            bottom: 1,
            right: 1,
            top: -1,
            left: -1,
          }),
          decode: () => decode,
        },
        {
          getBoundingClientRect: () => ({ width: 0, height: 0 }),
          decode: () => {
            throw new Error("offscreen");
          },
        },
      ],
    },
  });
  Object.defineProperty(globalThis, "innerHeight", {
    configurable: true,
    value: 800,
  });
  Object.defineProperty(globalThis, "innerWidth", {
    configurable: true,
    value: 400,
  });
  try {
    let finished = false;
    const ready = waitForHomeVisuals(new AbortController().signal).then(
      (value) => {
        finished = true;
        return value;
      },
    );
    await Promise.resolve();
    assert.equal(finished, false);
    release();
    assert.equal(await ready, true);
    const cancelled = new AbortController();
    cancelled.abort();
    assert.equal(await waitForHomeVisuals(cancelled.signal), false);
  } finally {
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "innerHeight");
    Reflect.deleteProperty(globalThis, "innerWidth");
  }
});
