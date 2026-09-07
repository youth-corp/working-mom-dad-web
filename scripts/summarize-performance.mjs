import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

export function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)];
}

export function summarize(events) {
  const groups = new Map();
  for (const input of events) {
    const amplitudeName = input.event_type?.replace(/^Performance /, "");
    const event = amplitudeName
      ? { ...input.event_properties, event: amplitudeName }
      : input;
    if (event.schema_version !== 1) continue;
    if (
      ![
        "api_request",
        "web_server_performance",
        "screen_first_data",
        "screen_fresh_data",
        "screen_outcome",
        "api_headers",
        "native_shell_home",
        "web_vital",
        "session_ready",
        "web_session_sync",
        "mobile_entry_redirect",
      ].includes(event.event)
    )
      continue;
    const dimensions = Object.fromEntries(
      [
        "event",
        "name",
        "route",
        "method",
        "web_release",
        "api_release",
        "app_version",
        "app_release",
        "environment",
        "platform",
        "surface",
        "visit",
        "trigger",
        "source",
        "visible",
        "sample_rate",
      ]
        .filter((key) => event[key] !== undefined)
        .map((key) => [key, event[key]]),
    );
    const key = JSON.stringify(dimensions);
    if (!groups.has(key))
      groups.set(key, {
        ...dimensions,
        count: 0,
        errors: 0,
        abandoned: 0,
        values: [],
        db: [],
      });
    const group = groups.get(key);
    group.count++;
    const abandoned =
      event.completed === false ||
      event.outcome === "abandoned" ||
      event.outcome === "aborted";
    const failed =
      event.ok === false ||
      (typeof event.status === "number" &&
        (event.status === 0 || event.status >= 400)) ||
      ["error", "demo", "http_error", "network_error", "exhausted"].includes(
        event.outcome,
      );
    if (abandoned) group.abandoned++;
    else if (failed) group.errors++;
    else {
      const value =
        event.event === "web_vital" ? event.value : event.duration_ms;
      if (typeof value === "number" && Number.isFinite(value) && value >= 0)
        group.values.push(value);
      if (typeof event.db_count === "number") group.db.push(event.db_count);
    }
  }
  return [...groups.values()].map(({ values, db, ...group }) => ({
    ...group,
    successful_samples: values.length,
    unit: group.name === "CLS" ? "score" : "ms",
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p95: percentile(values, 0.95),
    db_count_p50: percentile(db, 0.5),
  }));
}

async function main() {
  const file = process.argv[2];
  if (!file)
    throw new Error(
      "Usage: node scripts/summarize-performance.mjs <events.jsonl>",
    );
  const events = [];
  let skippedLines = 0;
  const lines = createInterface({
    input: createReadStream(file),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    try {
      events.push(JSON.parse(line));
    } catch {
      skippedLines++;
    }
  }
  console.log(
    JSON.stringify(
      { skipped_lines: skippedLines, groups: summarize(events) },
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
