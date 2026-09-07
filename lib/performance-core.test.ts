import assert from "node:assert/strict";
import { test } from "node:test";
import {
  safeRoute,
  ScreenTiming,
  type PerformanceFields,
} from "./performance-core";

test("route telemetry strips query strings and dynamic identifiers", () => {
  assert.equal(
    safeRoute(
      "https://api.example/children/private-child/missions?token=secret",
    ),
    "/children/:id/missions",
  );
  assert.equal(
    safeRoute("/me/chat/messages/private-message"),
    "/me/chat/messages/:id",
  );
  assert.equal(safeRoute("/"), "/");
});

test("cache display and successful unchanged revalidation have separate milestones", () => {
  const events: { name: string; fields: PerformanceFields }[] = [];
  const screen = new ScreenTiming(
    "/",
    100,
    "1",
    (name, fields) => events.push({ name, fields }),
    "tab",
  );
  screen.data("pending", 110, true);
  screen.data("cache", 140, true);
  screen.data("api", 750, true);
  screen.data("api", 800, true);
  screen.abandon(900);
  assert.deepEqual(
    events.map((event) => [event.name, event.fields.duration_ms]),
    [
      ["screen_first_data", 40],
      ["screen_fresh_data", 650],
    ],
  );
});

test("fresh first load produces both milestones; demo/failure never count as successful data", () => {
  for (const source of ["api", "demo", "error"] as const) {
    const events: string[] = [];
    const screen = new ScreenTiming(
      "/",
      0,
      "1",
      (name) => events.push(name),
      "document",
    );
    screen.data(source, 500, true);
    screen.data(source, 600, true);
    assert.deepEqual(
      events,
      source === "api"
        ? ["screen_first_data", "screen_fresh_data"]
        : ["screen_outcome"],
    );
  }
});

test("navigation away stops a slow request from becoming a successful screen sample", () => {
  const events: string[] = [];
  const screen = new ScreenTiming(
    "/",
    0,
    "1",
    (name) => events.push(name),
    "tab",
  );
  screen.abandon(100);
  screen.data("api", 600, true);
  assert.deepEqual(events, ["screen_outcome"]);
});
