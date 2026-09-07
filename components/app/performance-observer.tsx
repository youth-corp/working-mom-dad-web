"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { abandonScreen, reportPerformance } from "@/lib/performance";
import { safeRoute } from "@/lib/performance-core";

// Stable callback avoids re-registering observers on re-render.
const reportVitals: Parameters<typeof useReportWebVitals>[0] = (metric) => {
  reportPerformance("web_vital", {
    name: metric.name,
    value: metric.value,
    metric_id: metric.id,
    rating: metric.rating,
    navigation_type: metric.navigationType,
    // Web Vitals belong to the document navigation, not the current SPA tab.
    route: safeRoute(
      performance.getEntriesByType("navigation")[0]?.name ?? location.pathname,
    ),
  });
};

function EnabledObserver() {
  useReportWebVitals(reportVitals);
  useEffect(() => {
    const hide = () => abandonScreen();
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, []);
  return null;
}
export function PerformanceObserver() {
  return process.env.NEXT_PUBLIC_PERFORMANCE_ENABLED === "true" ? (
    <EnabledObserver />
  ) : null;
}
