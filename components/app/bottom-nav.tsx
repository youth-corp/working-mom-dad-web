"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import {
  getStoredSelectedChildId,
  loadWeeklyReportUnviewedStatus,
} from "@/lib/api";
import { track } from "@/lib/analytics";
import { beginScreen } from "@/lib/performance";
import type { NavigationEvent } from "@/lib/analytics";

const NAV_ICON_PATHS = {
  home: "/icons/figma/nav/home.svg",
  play: "/icons/figma/nav/play.svg",
  roadmap: "/icons/figma/nav/roadmap.svg",
  ai: "/icons/figma/nav/ai.svg",
  report: "/icons/figma/nav/report.svg",
} as const;

type BottomNavItem = {
  label: string;
  href: string;
  /** 분석용 탭 식별자. 라벨은 바뀔 수 있으므로 지표는 이 값으로 고정한다. */
  tab: NavigationEvent["tab"];
  iconSrc: string;
  iconClassName: string;
  matches: (pathname: string) => boolean;
};

// Figma 2524:2807 — 홈 / 놀이 / 로드맵 / AI 상담 / 리포트
const items: BottomNavItem[] = [
  {
    label: "홈",
    href: "/",
    tab: "home",
    iconSrc: NAV_ICON_PATHS.home,
    iconClassName: "size-6",
    matches: (pathname: string) => pathname === "/",
  },
  {
    label: "놀이",
    href: "/mission",
    tab: "play",
    iconSrc: NAV_ICON_PATHS.play,
    iconClassName: "size-6",
    matches: (pathname: string) => pathname.startsWith("/mission"),
  },
  {
    label: "로드맵",
    href: "/roadmap",
    tab: "roadmap",
    iconSrc: NAV_ICON_PATHS.roadmap,
    iconClassName: "size-6",
    matches: (pathname: string) => pathname.startsWith("/roadmap"),
  },
  {
    label: "리포트",
    href: "/weekly-report",
    tab: "report",
    iconSrc: NAV_ICON_PATHS.report,
    iconClassName: "size-5",
    matches: (pathname: string) => pathname.startsWith("/weekly-report"),
  },
  {
    label: "AI 상담",
    href: "/chat",
    tab: "chat",
    iconSrc: NAV_ICON_PATHS.ai,
    iconClassName: "size-5",
    matches: (pathname: string) => pathname.startsWith("/chat"),
  },
];

// 단색 SVG를 mask로 써서 currentColor로 칠한다 → 활성/비활성 색 전환이 라벨 색과 함께 동작.
const maskStyle = (src: string): CSSProperties => ({
  backgroundColor: "currentColor",
  maskImage: `url(${src})`,
  WebkitMaskImage: `url(${src})`,
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
  WebkitMaskPosition: "center",
  maskSize: "contain",
  WebkitMaskSize: "contain",
});

export const BottomNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [showReportTooltip, setShowReportTooltip] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/weekly-report")) {
      return;
    }

    let active = true;
    const checkUnviewedReport = () => {
      void loadWeeklyReportUnviewedStatus(getStoredSelectedChildId())
        .then((hasUnviewedReport) => {
          if (active) setShowReportTooltip(hasUnviewedReport);
        })
        .catch(() => {
          if (active) setShowReportTooltip(false);
        });
    };

    checkUnviewedReport();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkUnviewedReport();
    };
    window.addEventListener("focus", checkUnviewedReport);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      window.removeEventListener("focus", checkUnviewedReport);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 w-full px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 md:left-1/2 md:max-w-97.5 md:-translate-x-1/2">
      <div className="relative flex items-center gap-1 rounded-full bg-gray-20 p-1.5 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
        {showReportTooltip && !pathname.startsWith("/weekly-report") ? (
          <div
            role="status"
            className="pointer-events-none absolute bottom-[calc(100%+18px)] left-[70%] z-10 -translate-x-1/2"
          >
            <div className="report-tooltip-bounce">
              <div className="relative whitespace-nowrap rounded-full bg-gray-700 px-5 py-3 text-sm font-medium text-white shadow-2">
                생성된 리포트가 있어요!
                <span
                  aria-hidden
                  className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 bg-gray-700"
                />
              </div>
            </div>
          </div>
        ) : null}
        {items.map((item) => {
          const active = item.matches(pathname);

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                // 이미 열려 있는 탭이면 화면 전환이 없으므로 유입으로 세지 않는다.
                if (item.href === pathname) return;
                track({ type: "bottom_nav_tap", tab: item.tab });
                beginScreen(item.href);
                router.push(item.href);
              }}
              aria-current={active ? "page" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full py-1 text-xs leading-[1.4] ${
                active
                  ? "bg-gray-100 font-medium text-gray-800"
                  : "font-normal text-gray-400"
              }`}
            >
              <span className="flex size-6 items-center justify-center">
                <span
                  aria-hidden
                  className={`shrink-0 ${item.iconClassName}`}
                  style={maskStyle(item.iconSrc)}
                />
              </span>
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
