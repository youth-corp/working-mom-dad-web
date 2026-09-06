"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { track } from "@/lib/analytics";
import {
  ApiError,
  api,
  getStoredSelectedChildId,
  loadHomeDashboard,
  markAllNotificationsRead,
  markNotificationRead,
  setStoredSelectedChildId,
  type HomeLoadState,
} from "@/lib/api";
import type { HomeChild, HomeNotification } from "@/lib/home-data";
import { NotificationScheduleScreen } from "@/components/mission/notification-schedule-screen";
import { getWeeklyReportCountdown } from "@/lib/report-progress";
import {
  AiConsultationCard,
  HomeShortcutCards,
  ReportProgressBanner,
  TodayMissionCard,
} from "./cards";
import {
  ChildSwitcherDropdown,
  NotificationConfiguredModal,
  NotificationModal,
} from "./modals";
import { HomeError, HomeSkeleton } from "./skeleton";
import { TopAppBar } from "./top-app-bar";
import type { Modal } from "./types";
import { WeeklyCalendar } from "./weekly-calendar";

export const HomeDashboard = () => {
  const router = useRouter();
  const [state, setState] = useState<HomeLoadState | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [loading, setLoading] = useState(true);
  const [notificationSubmitting, setNotificationSubmitting] = useState(false);
  const [checkingNotification, setCheckingNotification] = useState(false);
  const [showNotificationNudge, setShowNotificationNudge] = useState(false);

  const refresh = useCallback(
    async (childId?: string | null, showLoading = true) => {
      if (showLoading) setLoading(true);
      try {
        const next = await loadHomeDashboard(childId);
        setState(next);
        setSelectedChildId(next.data.selectedChild.id);
      } catch {
        // 데이터가 아직 없으면 렌더에서 에러 UI를 노출. 기존 데이터가 있으면 유지한다.
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // 당겨서새로고침 — 로딩 스켈레톤 대신 헤더 아래 스피너만 노출(showLoading=false).
  const onPullRefresh = useCallback(
    () => refresh(selectedChildId ?? getStoredSelectedChildId(), false),
    [refresh, selectedChildId],
  );
  const { distance: pullDistance, refreshing: pullRefreshing } =
    usePullToRefresh(onPullRefresh);

  useEffect(() => {
    track({ type: "home_view" });
    let active = true;
    void (async () => {
      // 홈 데이터와 알림 설정 상태는 서로 의존하지 않는다. 직렬로 기다리면
      // API 왕복이 2번 쌓여 첫 화면이 그만큼 늦어지므로 함께 띄운다.
      const [home, me] = await Promise.allSettled([
        loadHomeDashboard(getStoredSelectedChildId()),
        api.getMe(),
      ]);
      if (!active) return;

      if (home.status === "fulfilled") {
        setState(home.value);
        setSelectedChildId(home.value.data.selectedChild.id);
      }
      // 실패 시 state가 없으므로 렌더에서 에러 UI가 노출된다.

      if (me.status === "fulfilled") {
        const playNotificationEnabled = me.value.notificationPreferences.some(
          (preference) =>
            preference.type === "play_10min" && preference.enabled,
        );
        setShowNotificationNudge(!playNotificationEnabled);
      }
      // 설정 상태를 확인하지 못하면 잘못 보이는 것보다 숨김을 우선한다.

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const data = state?.data;

  const selectedChild = useMemo(() => {
    if (!data) return null;
    return (
      data.children.find((child) => child.id === selectedChildId) ??
      data.selectedChild
    );
  }, [data, selectedChildId]);

  if (!data || !selectedChild) {
    return loading ? (
      <HomeSkeleton />
    ) : (
      <HomeError onRetry={() => void refresh(getStoredSelectedChildId())} />
    );
  }

  const onSelectChild = (child: HomeChild) => {
    track({ type: "home_child_switch" });
    setStoredSelectedChildId(child.id);
    setSelectedChildId(child.id);
    setModal(null);
    void refresh(child.id);
  };

  const markNotificationReadLocally = (notificationId: string) => {
    setState((current) => {
      if (!current) return current;

      let changed = false;
      const latest = current.data.notifications.latest.map((notification) => {
        if (notification.id !== notificationId || notification.readAt) {
          return notification;
        }

        changed = true;
        return {
          ...notification,
          readAt: new Date().toISOString(),
        };
      });

      if (!changed) {
        return current;
      }

      return {
        ...current,
        data: {
          ...current.data,
          notifications: {
            ...current.data.notifications,
            unreadCount: Math.max(
              0,
              current.data.notifications.unreadCount - 1,
            ),
            latest,
          },
        },
      };
    });
  };

  const markAllNotificationsReadLocally = () => {
    setState((current) => {
      if (!current) return current;

      const latest = current.data.notifications.latest.map((notification) =>
        notification.readAt
          ? notification
          : { ...notification, readAt: new Date().toISOString() },
      );

      return {
        ...current,
        data: {
          ...current.data,
          notifications: {
            ...current.data.notifications,
            unreadCount: 0,
            latest,
          },
        },
      };
    });
  };

  const openNotificationTarget = (notification: HomeNotification) => {
    if (notification.targetType === "child" && notification.targetId) {
      setStoredSelectedChildId(notification.targetId);
    }

    switch (notification.actionType) {
      case "open_home":
        if (notification.targetType === "child") {
          router.push("/mission");
          return;
        }
        router.push("/");
        return;
      case "open_mission":
        router.push("/mission");
        return;
      case "open_roadmap":
        router.push("/roadmap");
        return;
      case "open_chat":
        router.push("/chat");
        return;
      case "open_report":
        router.push(
          notification.targetId
            ? `/weekly-report?reportId=${encodeURIComponent(notification.targetId)}`
            : "/weekly-report",
        );
        return;
      case "url":
        if (notification.targetUrl) {
          window.location.href = notification.targetUrl;
        }
        return;
      default:
        return;
    }
  };

  const handleNotificationOpen = async (notification: HomeNotification) => {
    if (notificationSubmitting) {
      return;
    }

    setNotificationSubmitting(true);
    try {
      if (!notification.readAt) {
        await markNotificationRead(notification.id);
        markNotificationReadLocally(notification.id);
      }
      setModal(null);
      track({ type: "home_notification_open" });
      openNotificationTarget(notification);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/onboarding/intro");
        return;
      }
    } finally {
      setNotificationSubmitting(false);
    }
  };

  const handleMarkAllNotificationsRead = async () => {
    if (notificationSubmitting || data?.notifications.unreadCount === 0) {
      return;
    }

    setNotificationSubmitting(true);
    try {
      await markAllNotificationsRead();
      markAllNotificationsReadLocally();
      track({ type: "home_notifications_mark_all_read" });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/onboarding/intro");
        return;
      }
    } finally {
      setNotificationSubmitting(false);
    }
  };

  const startMissionFromHome = () => {
    track({ type: "home_mission_start_click" });
    router.push("/mission");
  };

  const openNotificationNudge = async () => {
    if (checkingNotification) return;
    track({ type: "home_play_notification_nudge_click" });
    setCheckingNotification(true);
    try {
      const me = await api.getMe();
      const configured = me.notificationPreferences.some(
        (preference) => preference.type === "play_10min" && preference.enabled,
      );
      setModal(
        configured ? "notification-configured" : "notification-schedule",
      );
    } catch {
      // 상태를 확인하지 못해도 설정 화면에서 다시 저장할 수 있게 한다.
      setModal("notification-schedule");
    } finally {
      setCheckingNotification(false);
    }
  };

  return (
    <>
      {/* 인스타그램식 고정 헤더 — 스크롤·당겨서새로고침(overscroll)에도 상단 고정.
          sticky는 iOS 러버밴드 때 함께 움직여 fixed로 처리. */}
      <div className="fixed inset-x-0 top-0 z-50 mx-auto w-full max-w-107.5 bg-white px-5 pt-safe">
        <div className="relative">
          <TopAppBar
            child={selectedChild}
            unreadCount={data.notifications.unreadCount}
            onOpenChildren={() => setModal("children")}
            onOpenNotifications={() => setModal("notifications")}
          />
          {modal === "children" ? (
            <>
              <button
                type="button"
                aria-label="닫기"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setModal(null)}
              />
              <div className="absolute left-0 top-14 z-50">
                <ChildSwitcherDropdown
                  childItems={data.children}
                  selectedChildId={selectedChild.id}
                  onSelect={onSelectChild}
                  onEdit={(child) => {
                    setModal(null);
                    router.push(`/settings/children/${child.id}`);
                  }}
                  onDelete={() => {
                    setModal(null);
                    router.push("/settings/children");
                  }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
      {/* 당겨서새로고침 스피너 — 고정 헤더 바로 아래(z-40 < 헤더 z-50)에 표시 */}
      {pullDistance > 0 || pullRefreshing ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-40 mx-auto w-full max-w-107.5 pt-safe"
        >
          <div className="h-14" />
          <div className="flex justify-center">
            <div
              className={`mt-2 size-6 rounded-full border-2 border-gray-200 border-t-primary-300 ${
                pullRefreshing ? "animate-spin" : ""
              }`}
              style={{
                transform: pullRefreshing
                  ? undefined
                  : `translateY(${pullDistance}px) rotate(${pullDistance * 3}deg)`,
                opacity: pullRefreshing ? 1 : Math.min(1, pullDistance / 40),
              }}
            />
          </div>
        </div>
      ) : null}
      <div className="relative bg-gray-20 pb-9 text-gray-800">
        {/* 고정 헤더(safe-area + 56px) 높이만큼 콘텐츠 하강 */}
        <div aria-hidden className="pt-safe">
          <div className="h-14" />
        </div>
        <div className="bg-white px-5 pt-4">
          <ReportProgressBanner
            countdown={getWeeklyReportCountdown()}
            streak={data.playStreakDays}
          />
        </div>
        <WeeklyCalendar data={data} />
        <div className="flex flex-col gap-4 px-5 pt-4">
          <TodayMissionCard
            mission={data.recommendedMission}
            loading={loading}
            showNotificationNudge={showNotificationNudge}
            onStart={startMissionFromHome}
            onNotification={() => void openNotificationNudge()}
          />
          <HomeShortcutCards
            roadmapProgress={data.roadmapProgress}
            reportSummary={data.reportSummary}
            reportCountdown={getWeeklyReportCountdown()}
            onRoadmap={() => router.push("/roadmap")}
            onReport={() => router.push("/weekly-report")}
          />
          <AiConsultationCard onClick={() => router.push("/chat")} />
        </div>
      </div>
      {modal === "notifications" ? (
        <NotificationModal
          notifications={data.notifications.latest}
          unreadCount={data.notifications.unreadCount}
          submitting={notificationSubmitting}
          onClose={() => setModal(null)}
          onMarkAllRead={() => void handleMarkAllNotificationsRead()}
          onOpenNotification={(notification) =>
            void handleNotificationOpen(notification)
          }
        />
      ) : null}
      {modal === "notification-configured" ? (
        <NotificationConfiguredModal onClose={() => setModal(null)} />
      ) : null}
      {modal === "notification-schedule" ? (
        <div className="fixed inset-0 z-60 mx-auto w-full max-w-107.5">
          <NotificationScheduleScreen
            onClose={() => setModal(null)}
            onComplete={() => setModal("notification-configured")}
          />
        </div>
      ) : null}
      {checkingNotification ? (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/20"
          aria-label="알림 설정 확인 중"
        >
          <span className="size-7 animate-spin rounded-full border-2 border-white border-t-primary-300" />
        </div>
      ) : null}
    </>
  );
};
