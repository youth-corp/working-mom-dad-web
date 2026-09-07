const SERVER_SESSION_READY_PATH = "/auth/session-ready";

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForServerSession(options?: {
  retries?: number;
  delayMs?: number;
}) {
  if (typeof window === "undefined") {
    return false;
  }

  const retries = options?.retries ?? 20;
  const delayMs = options?.delayMs ?? 100;
  const started = performance.now();

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const response = await measuredFetch(SERVER_SESSION_READY_PATH, {
      credentials: "include",
      cache: "no-store",
    });

    if (response.ok) {
      reportPerformance("session_ready", {
        duration_ms: performance.now() - started,
        attempts: attempt + 1,
        outcome: "success",
      });
      return true;
    }

    await delay(delayMs);
  }

  reportPerformance("session_ready", {
    duration_ms: performance.now() - started,
    attempts: retries,
    outcome: "exhausted",
  });
  return false;
}
import { measuredFetch, reportPerformance } from "./performance";
