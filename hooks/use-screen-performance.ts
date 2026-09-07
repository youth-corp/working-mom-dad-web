"use client";

import { useEffect } from "react";
import { getScreen, reportNativeHome } from "@/lib/performance";
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
        if (route === "/" && source === "api") reportNativeHome();
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [route, source]);
}
