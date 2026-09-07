"use client";

import { useEffect } from "react";
import {
  getScreen,
  reportNativeHome,
  reportPerformance,
} from "@/lib/performance";
import { waitForHomeVisuals } from "@/lib/home-visual-ready";
import type { DataSource } from "@/lib/performance-core";

/** Two animation frames after a React commit approximate visible content, not hardware paint.
 * Future Query callers: cached data => cache; successful revalidation => api (even if unchanged).
 */
export function useScreenPerformance(route: string, source: DataSource) {
  useEffect(() => {
    const screen = getScreen(route);
    if (source === "pending") return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        screen.data(
          source,
          performance.now(),
          document.visibilityState === "visible",
        );
        if (
          route === "/" &&
          source === "api" &&
          window.__YOUGABELL_PERFORMANCE__?.startupProtocol !== 2
        )
          reportNativeHome();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [route, source]);

  useEffect(() => {
    if (route !== "/" || source !== "api") return;
    if (window.__YOUGABELL_PERFORMANCE__?.startupProtocol !== 2) {
      return;
    }
    const controller = new AbortController();
    let frame = 0;
    void waitForHomeVisuals(controller.signal).then((ready) => {
      if (controller.signal.aborted) return;
      if (!ready) {
        reportPerformance("native_home_ready_skipped", {
          reason: "visual_assets_unready",
        });
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => reportNativeHome());
      });
    });
    return () => {
      controller.abort();
      cancelAnimationFrame(frame);
    };
  }, [route, source]);
}
