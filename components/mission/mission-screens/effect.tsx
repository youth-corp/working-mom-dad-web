"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/characters/mascot";
import { NotificationPermissionModal } from "@/components/mission/notification-permission-modal";
import { NotificationScheduleScreen } from "@/components/mission/notification-schedule-screen";
import {
  ApiError,
  api,
  getStoredSelectedChildId,
  loadCurrentMission,
  loadMissionExecutionEffect,
  type MissionEffectLoadState,
  type MissionLoadState,
} from "@/lib/api";
import {
  isNativeWebView,
  openNativeNotificationSettings,
  requestNativePushPermission,
  requestNativePushPermissionStatus,
} from "@/lib/native-bridge";
import {
  HeaderSpacer,
  MissionContentSkeleton,
  MissionErrorState,
  MissionHeader,
} from "./shared";

function getEffectLabel(effect: string, fallback: string) {
  const normalized = effect.replace(/\s+/g, " ").trim();
  const quoted = normalized.match(/[“"]([^”"]+)[”"]/);

  if (quoted?.[1]) {
    return quoted[1];
  }

  const childEffect = normalized.match(/아이의\s*([^과와,.]+)(?:과|와)/);

  if (childEffect?.[1]) {
    return childEffect[1].trim();
  }

  const objectPhrase = normalized.match(/^(.{2,18}?)(?:을|를)\s/);

  if (objectPhrase?.[1]) {
    return objectPhrase[1].trim();
  }

  return fallback;
}

function isPlayNotificationDisabled(
  preferences: Array<{ type: string; enabled: boolean }>,
) {
  return !preferences.some(
    (preference) =>
      preference.type === "play_10min" && preference.enabled === true,
  );
}

function getDebugNotificationPermission(): "denied" | null {
  if (process.env.NODE_ENV !== "development" || typeof window === "undefined") {
    return null;
  }

  return new URLSearchParams(window.location.search).get(
    "notificationPromptDebug",
  ) === "denied"
    ? "denied"
    : null;
}

export function MissionEffectScreen({
  executionId,
  mode,
}: {
  executionId: string | null;
  mode: "api" | "demo" | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<MissionEffectLoadState | null>(null);
  const [missionState, setMissionState] = useState<MissionLoadState | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<
    "request" | "settings" | "schedule" | null
  >(null);
  const [promptBusy, setPromptBusy] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    "granted" | "denied" | "undetermined" | null
  >(null);
  const [notificationToast, setNotificationToast] = useState(false);
  const promptCheckStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!executionId) {
        router.replace("/mission");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [effectResult, missionResult] = await Promise.all([
          loadMissionExecutionEffect({ executionId, mode }),
          loadCurrentMission(getStoredSelectedChildId()),
        ]);

        if (cancelled) {
          return;
        }

        setState(effectResult);
        setMissionState(missionResult);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof ApiError
            ? "미션 효과 정보를 불러오지 못했어요."
            : "API 서버에 연결할 수 없습니다.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [executionId, mode, router]);

  useEffect(() => {
    const debugPermission = getDebugNotificationPermission();
    if (
      loading ||
      !state ||
      promptCheckStarted.current ||
      (!isNativeWebView() && !debugPermission)
    ) {
      return;
    }

    promptCheckStarted.current = true;
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const status =
          debugPermission ?? (await requestNativePushPermissionStatus());
        if (cancelled || !status) return;

        // 앱 내부의 놀이 알림이 이미 켜져 있으면 OS 권한 상태와 무관하게
        // 다시 요청하지 않는다. 홈 카드의 알림 설정은 서버 설정만 저장하고
        // OS 권한은 건드리지 않으므로, granted 조건으로만 걸러내면 이미
        // 설정을 마친 사용자에게 요청 모달이 다시 노출된다.
        // 알림이 꺼져 있고 OS 권한이 허용된 경우에는 시간대 설정으로
        // 유도하며, 이때 OS 권한을 다시 요청하지는 않는다.
        try {
          const me = await api.getMe();
          if (
            cancelled ||
            !isPlayNotificationDisabled(me.notificationPreferences)
          ) {
            return;
          }
        } catch {
          return;
        }

        try {
          // 실제 모달을 열기 직전에 계정 기준 최초 노출을 원자적으로 예약한다.
          const exposure = await api.claimNotificationPromptExposure();
          if (!cancelled && exposure.shouldShow) {
            setPermissionStatus(status);
            setPrompt("request");
          }
        } catch {
          // 노출 이력을 확실히 기록할 수 없으면 반복 노출을 피하기 위해 모달을 띄우지 않는다.
        }
      })();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [loading, state]);

  useEffect(() => {
    if (prompt !== "settings") return;

    const recheckPermission = () => {
      void requestNativePushPermissionStatus().then((status) => {
        if (status === "granted") {
          setPermissionStatus(status);
          setPrompt("schedule");
        }
      });
    };

    window.addEventListener("focus", recheckPermission);
    document.addEventListener("visibilitychange", recheckPermission);
    return () => {
      window.removeEventListener("focus", recheckPermission);
      document.removeEventListener("visibilitychange", recheckPermission);
    };
  }, [prompt]);

  const handlePromptConfirm = async () => {
    if (prompt === "settings") {
      openNativeNotificationSettings();
      return;
    }

    if (permissionStatus === "denied") {
      setPrompt("settings");
      return;
    }

    if (permissionStatus === "granted") {
      setPrompt("schedule");
      return;
    }

    setPromptBusy(true);
    const result = await requestNativePushPermission();
    setPromptBusy(false);

    if (result === "granted") {
      setPermissionStatus(result);
      setPrompt("schedule");
      return;
    }

    setPermissionStatus("denied");
    setPrompt("settings");
  };

  const handleScheduleComplete = () => {
    setPrompt(null);
    setNotificationToast(true);
    window.setTimeout(() => setNotificationToast(false), 3000);
  };

  if (loading) {
    return <MissionContentSkeleton />;
  }

  if (!state || !executionId || error) {
    return (
      <MissionErrorState
        message={error ?? "미션 효과 정보를 불러오지 못했어요."}
        onBack={() => router.push("/")}
      />
    );
  }

  const childLabel = missionState
    ? `${missionState.data.selectedChild.name} (${missionState.data.selectedChild.ageLabel})`
    : "아이";
  const mission = state.data.mission;
  const effectLabel = getEffectLabel(mission.effect, mission.title);

  if (prompt === "schedule") {
    return (
      <NotificationScheduleScreen
        onClose={() => setPrompt(null)}
        onComplete={handleScheduleComplete}
      />
    );
  }

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[#fbfbfb] px-5 pb-[max(20px,env(safe-area-inset-bottom))] text-gray-800">
      <div
        className="pointer-events-none absolute left-1/2 top-[252px] h-63.25 w-141 -translate-x-1/2 rounded-full opacity-70 blur-3xl"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(149,114,255,0.12) 0%, rgba(149,114,255,0.04) 55%, rgba(149,114,255,0) 100%)",
        }}
        aria-hidden
      />
      <MissionHeader childLabel={childLabel} onBack={() => router.push("/")} />
      <HeaderSpacer />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto">
        <Mascot pose="resting" className="w-27.5" />
        <div className="space-y-3.75 text-center">
          <h1 className="text-[20px] font-bold leading-[1.4] tracking-[-0.4px] text-gray-800">
            아이의 “{effectLabel}”에
            <br />
            도움이 되는 시간이었어요.
          </h1>
          <p className="text-sm leading-[1.4] text-gray-600">
            오늘 하루도 수고하셨습니다!
          </p>
        </div>
        <div className="flex w-full flex-col items-start justify-center gap-2 rounded-[24px] border border-[#f4f4f4] bg-white px-6 py-5">
          <p className="text-xs font-medium leading-[1.4] text-black/50">
            효과
          </p>
          <p className="whitespace-pre-line text-sm leading-[1.4] text-black">
            {mission.effect}
          </p>
        </div>
      </div>

      <div className="shrink-0 pb-2 pt-5">
        {notificationToast ? (
          <p className="mb-3 rounded-xl bg-gray-800 px-4 py-3 text-center text-xs font-medium text-white">
            알림 설정이 완료되었어요! 🎉
          </p>
        ) : null}
        {state.message ? (
          <p className="mb-3 text-center text-xs leading-4 text-gray-400">
            {state.message}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() =>
            router.push(
              `/mission/feedback?executionId=${executionId}&mode=${state.source}`,
            )
          }
          className="flex h-13 w-full items-center justify-center rounded-2xl bg-primary-300 text-base font-medium leading-[1.4] text-white"
        >
          다음
        </button>
      </div>

      {prompt === "request" || prompt === "settings" ? (
        <NotificationPermissionModal
          variant={prompt}
          busy={promptBusy}
          onClose={() => setPrompt(null)}
          onConfirm={() => void handlePromptConfirm()}
        />
      ) : null}
    </div>
  );
}
