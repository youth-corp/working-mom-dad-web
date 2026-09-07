import assert from "node:assert/strict";
import { test } from "node:test";
import { percentile, summarize } from "./summarize-performance.mjs";

test("nearest-rank percentiles do not mutate samples", () => {
  const samples = [40, 10, 30, 20];
  assert.equal(percentile(samples, 0.5), 20);
  assert.equal(percentile(samples, 0.75), 30);
  assert.equal(percentile(samples, 0.95), 40);
  assert.deepEqual(samples, [40, 10, 30, 20]);
  assert.equal(percentile([], 0.5), null);
});

test("separates releases and excludes errors/aborts from latency while counting them", () => {
  const sample = {
    event: "api_request",
    schema_version: 1,
    route: "/home",
    api_release: "a",
    status: 200,
    completed: true,
    duration_ms: 10,
  };
  const result = summarize([
    sample,
    { ...sample, status: 500, duration_ms: 999 },
    { ...sample, completed: false },
    { ...sample, api_release: "b", duration_ms: 20 },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].count, 3);
  assert.equal(result[0].errors, 1);
  assert.equal(result[0].abandoned, 1);
  assert.equal(result[0].p95, 10);
  assert.equal(result[1].p95, 20);
});

test("reads Amplitude export properties and keeps CLS unit separate", () => {
  const result = summarize([
    {
      event_type: "Performance web_vital",
      event_properties: { schema_version: 1, name: "CLS", value: 0.03 },
    },
  ]);
  assert.equal(result[0].p75, 0.03);
  assert.equal(result[0].unit, "score");
});
