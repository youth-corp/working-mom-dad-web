import { trackPerformance } from "./analytics";
import {
  safeRoute,
  ScreenTiming,
  type PerformanceFields,
} from "./performance-core";

declare global {
  interface Window {
    __YOUGABELL_PERFORMANCE__?: {
      launchId: string;
      startedAt: number;
      appVersion: string;
      appRelease: string;
      platform: string;
      entryPath: string;
      sessionLookupMs?: number;
      startupClock?:
        | "android_elapsed_realtime"
        | "ios_system_uptime"
        | "js_shell";
      nativeStartupElapsedMs?: number;
      startupProtocol?: number;
    };
  }
}

let context: PerformanceFields | undefined;
let sampled = false;
let current: ScreenTiming | undefined;
let sequence = 0;
let nativeHomeReported = false;

function storageGet(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}
function initialize() {
  if (context || typeof window === "undefined") return;
  const native = window.__YOUGABELL_PERFORMANCE__;
  let visit = "unknown";
  let sample = Math.random();
  try {
    visit =
      storageGet(sessionStorage, "perf:visit") ??
      (storageGet(localStorage, "perf:visited") ? "repeat" : "first");
    sessionStorage.setItem("perf:visit", visit);
    localStorage.setItem("perf:visited", "1");
    const storedSample = storageGet(sessionStorage, "perf:sample");
    if (storedSample !== null && Number.isFinite(Number(storedSample)))
      sample = Number(storedSample);
    else sessionStorage.setItem("perf:sample", String(sample));
  } catch {
    /* Restricted WebView storage: unknown cohort, document-level sample. */
  }
  const rate = Number(process.env.NEXT_PUBLIC_PERFORMANCE_SAMPLE_RATE ?? 1);
  sampled =
    process.env.NEXT_PUBLIC_PERFORMANCE_ENABLED === "true" &&
    Number.isFinite(rate) &&
    sample < Math.max(0, Math.min(1, rate));
  context = {
    schema_version: 1,
    document_id: crypto.randomUUID(),
    web_release: process.env.NEXT_PUBLIC_PERFORMANCE_RELEASE || "unknown",
    environment:
      process.env.NEXT_PUBLIC_PERFORMANCE_ENVIRONMENT || process.env.NODE_ENV,
    visit,
    sample_rate: rate,
    surface: window.__YOUGABELL_NATIVE__ ? "webview" : "browser",
    app_version: native?.appVersion ?? "unknown",
    app_release: native?.appRelease ?? "unknown",
    platform:
      native?.platform ??
      (/Android/.test(navigator.userAgent)
        ? "android"
        : /iPad|iPhone/.test(navigator.userAgent)
          ? "ios"
          : "desktop"),
    ...(native ? { launch_id: native.launchId } : {}),
  };
}

export function reportPerformance(name: string, fields: PerformanceFields) {
  if (
    typeof window === "undefined" ||
    process.env.NEXT_PUBLIC_PERFORMANCE_ENABLED !== "true"
  )
    return;
  try {
    initialize();
    if (!sampled) return;
    const event = { ...context, ...fields };
    // Numeric marks are visible in DevTools Timings; no payload/user data attached.
    const now = performance.now();
    if (typeof fields.duration_ms === "number" && fields.duration_ms <= now) {
      performance.measure(`yougabell:${name}`, {
        start: Math.max(0, now - fields.duration_ms),
        end: now,
        detail: event,
      });
      performance.clearMeasures(`yougabell:${name}`);
    } else {
      performance.mark(`yougabell:${name}`, { detail: event });
      performance.clearMarks(`yougabell:${name}`);
    }
    trackPerformance(name, event);
  } catch {
    /* Analytics/storage failure must never change app behavior. */
  }
}

export function beginScreen(path: string, trigger: "tab" | "mount" = "tab") {
  const now = performance.now();
  current?.abandon(now);
  current = new ScreenTiming(
    safeRoute(path),
    now,
    String(++sequence),
    reportPerformance,
    trigger,
  );
  reportPerformance("screen_start", {
    route: current.route,
    journey_id: current.id,
    trigger,
  });
  return current;
}

export function getScreen(path: string) {
  const route = safeRoute(path);
  if (current?.route === route) return current;
  if (current) return beginScreen(path, "mount");
  current = new ScreenTiming(
    route,
    0,
    String(++sequence),
    reportPerformance,
    "document",
  );
  reportPerformance("screen_start", {
    route,
    journey_id: current.id,
    trigger: "document",
  });
  return current;
}

export function abandonScreen() {
  current?.abandon(performance.now());
}

export function markNativeHomeEntry() {
  const native = window.__YOUGABELL_PERFORMANCE__;
  if (!native) return;
  try {
    sessionStorage.setItem("perf:home-eligible", native.launchId);
  } catch {
    /* No reliable cross-document measurement without storage. */
  }
}

export function reportNativeHome() {
  const native = window.__YOUGABELL_PERFORMANCE__;
  if (native?.startupProtocol === 2) {
    if (nativeHomeReported || document.visibilityState !== "visible") return;
    nativeHomeReported = true;
    const onResult = (event: Event) => {
      const result = (event as CustomEvent).detail;
      if (!result || result.launch_id !== native.launchId) return;
      window.removeEventListener("yougabell-startup-result", onResult);
      clearTimeout(timeout);
      const duration = result.duration_ms;
      if (
        typeof duration === "number" &&
        Number.isFinite(duration) &&
        duration >= 0
      ) {
        reportPerformance("native_home_ready", {
          schema_version: 2,
          duration_ms: duration,
          clock: result.clock,
          start_point: result.start_point,
          endpoint: result.endpoint,
          launch_type: result.launch_type,
          visible: true,
        });
      } else {
        reportPerformance("native_home_ready_skipped", {
          reason: result.reason ?? "invalid_result",
        });
      }
    };
    window.addEventListener("yougabell-startup-result", onResult);
    const timeout = window.setTimeout(() => {
      window.removeEventListener("yougabell-startup-result", onResult);
      reportPerformance("native_home_ready_skipped", {
        reason: "native_reply_timeout",
      });
    }, 10000);
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({
        type: "PERFORMANCE_HOME_READY",
        payload: { launchId: native.launchId },
      }),
    );
    return;
  }
  if (!native) {
    reportPerformance("native_shell_home_skipped", {
      reason: "missing_native_context",
    });
    return;
  }
  if (nativeHomeReported) {
    return;
  }
  if (native.entryPath !== "/mobile-entry") {
    reportPerformance("native_shell_home_skipped", {
      reason: "entry_path_mismatch",
      entry_path: safeRoute(native.entryPath),
    });
    return;
  }
  try {
    if (sessionStorage.getItem("perf:home-eligible") !== native.launchId) {
      reportPerformance("native_shell_home_skipped", {
        reason: "missing_launch_marker",
      });
      return;
    }
    if (sessionStorage.getItem("perf:home-launch") === native.launchId) {
      return;
    }
    sessionStorage.setItem("perf:home-launch", native.launchId);
  } catch {
    reportPerformance("native_shell_home_skipped", {
      reason: "storage_unavailable",
    });
    return;
  }
  nativeHomeReported = true;
  const duration = Date.now() - native.startedAt;
  if (duration < 0) return;
  reportPerformance("native_shell_home", {
    duration_ms: duration,
    visible: document.visibilityState === "visible",
    clock: "wall",
    startup_source:
      native.startupClock === undefined || native.startupClock === "js_shell"
        ? "js_shell"
        : "native_callback_wall_estimate",
    ...(native.sessionLookupMs === undefined
      ? {}
      : { session_lookup_ms: native.sessionLookupMs }),
    ...(native.nativeStartupElapsedMs === undefined
      ? {}
      : { native_startup_elapsed_ms: native.nativeStartupElapsedMs }),
  });
}

/** fetch resolves at response headers, NOT complete body/JSON/screen readiness. */
export const measuredFetch: typeof fetch = async (input, init) => {
  const started = performance.now();
  const journeyId = current?.id ?? "none";
  const url = input instanceof Request ? input.url : String(input);
  const method =
    init?.method ?? (input instanceof Request ? input.method : "GET");
  try {
    const response = await fetch(input, init);
    reportPerformance("api_headers", {
      journey_id: journeyId,
      api_release: response.headers.get("x-api-release") ?? "unavailable",
      route: safeRoute(url),
      method,
      duration_ms: performance.now() - started,
      status: response.status,
      outcome: response.ok ? "success" : "http_error",
      request_id: response.headers.get("x-request-id") ?? "unavailable",
    });
    return response;
  } catch (error) {
    reportPerformance("api_headers", {
      journey_id: journeyId,
      route: safeRoute(url),
      method,
      duration_ms: performance.now() - started,
      status: 0,
      outcome:
        error instanceof Error && error.name === "AbortError"
          ? "aborted"
          : "network_error",
    });
    throw error;
  }
};
