import * as amplitude from "@amplitude/analytics-browser";
import { sendGAEvent } from "@next/third-parties/google";

// 제품 분석 이벤트. 이벤트 속성에는 개인정보, 자녀 식별자, 채팅 원문을 넣지 않는다.

export type OnboardingEvent =
  | { type: "onboarding_intro_view"; page?: number }
  | { type: "onboarding_google_sign_in_click" }
  | { type: "onboarding_apple_sign_in_click" }
  | {
      type: "onboarding_step_complete";
      step:
        | "consent"
        | "parent"
        | "interest"
        | "notification"
        | "app_usage"
        | "children";
    }
  | { type: "onboarding_work_status_filled" }
  | { type: "onboarding_skip"; from: "intro" }
  | { type: "onboarding_finish" };

// 설정 화면 이벤트 (docs/features/20260519-settings.md §6).
export type SettingsEvent =
  | { type: "settings_open" }
  | {
      type: "settings_notification_change";
      notificationType: "play_10min" | "weekly_report";
      enabled: boolean;
    }
  | { type: "settings_interests_save"; count: number }
  | { type: "settings_parent_save" }
  | { type: "settings_child_add" }
  | { type: "settings_child_update"; childId: string }
  | { type: "settings_child_delete"; childId: string }
  | { type: "settings_logout" }
  | { type: "settings_account_delete_confirm" };

// 1:1 문의 이벤트 (docs/features/20260819-inquiry.md §6).
// 제목·본문·이메일은 개인정보를 담을 수 있어 속성으로 보내지 않는다.
export type InquiryEvent =
  | { type: "inquiry_list_view" }
  | { type: "inquiry_form_view" }
  | { type: "inquiry_submit"; category: string | null }
  | { type: "inquiry_detail_view"; status: string };

// AI 챗봇 이벤트 (docs/features/20260525-ai-integration.md §6).
export type ChatEvent =
  | { type: "chat_open" }
  | { type: "chat_message_send"; length: number }
  | { type: "chat_response_first_token"; latencyMs: number }
  | {
      type: "chat_response_complete";
      latencyMs: number;
      cardCount: number;
      sourceCount: number;
    }
  | { type: "chat_response_error"; reason: string }
  | { type: "chat_quick_reply_use"; label: string }
  | { type: "chat_source_link_open"; domain: string };

export type HomeEvent =
  | { type: "home_view" }
  | { type: "home_child_switch" }
  | { type: "home_mood_submit" }
  | { type: "home_notification_open" }
  | { type: "home_notifications_mark_all_read" }
  | { type: "home_mission_start_click" }
  | { type: "home_play_notification_nudge_click" }
  | { type: "home_mission_restart" };

export type MissionEvent =
  | { type: "mission_view" }
  | { type: "mission_start" }
  | { type: "mission_resume" }
  | { type: "mission_pause" }
  | { type: "mission_complete"; completionType: "timer" | "early" }
  | { type: "mission_feedback_submit" };

export type RoadmapEvent =
  | { type: "roadmap_view" }
  | { type: "roadmap_month_select" };

export type WeeklyReportEvent =
  | { type: "weekly_report_view"; hasReport: boolean }
  | { type: "weekly_report_mission_start" };

/**
 * 하단 네비게이션 유입 (2026-08-20 추가).
 *
 * 탭별로 이벤트를 나누지 않고 `tab` 속성으로 구분한다 — 탭이 늘거나 이름이 바뀌어도
 * 이벤트 목록이 흔들리지 않고, Amplitude에서 탭 간 비교를 한 차트로 볼 수 있다.
 *
 * 이미 열려 있는 탭을 다시 누른 경우는 보내지 않는다. "어느 경로로 들어왔는가"를
 * 보려는 지표라 화면 전환이 없는 탭은 유입이 아니다.
 */
export type NavigationEvent = {
  type: "bottom_nav_tap";
  tab: "home" | "play" | "roadmap" | "chat" | "report";
};

export type AnalyticsEvent =
  | OnboardingEvent
  | SettingsEvent
  | ChatEvent
  | HomeEvent
  | MissionEvent
  | RoadmapEvent
  | WeeklyReportEvent
  | InquiryEvent
  | NavigationEvent;

type AmplitudeEvent = {
  name: string;
  properties?: Record<string, boolean | number | string>;
};

let initialized = false;

function initializeAmplitude(): boolean {
  if (typeof window === "undefined") return false;

  const apiKey = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;
  if (!apiKey) return false;

  if (!initialized) {
    amplitude.init(apiKey, {
      // 육아·채팅 UI의 입력값과 클릭 대상이 자동 수집되지 않도록 한다.
      autocapture: false,
      defaultTracking: false,
    });
    initialized = true;
  }

  return true;
}

export function toAmplitudeEvent(event: AnalyticsEvent): AmplitudeEvent {
  switch (event.type) {
    case "onboarding_intro_view":
      return {
        name: "Onboarding Intro Viewed",
        properties: { page: event.page ?? 1 },
      };
    case "onboarding_google_sign_in_click":
      return {
        name: "Onboarding Sign In Clicked",
        properties: { provider: "google" },
      };
    case "onboarding_apple_sign_in_click":
      return {
        name: "Onboarding Sign In Clicked",
        properties: { provider: "apple" },
      };
    case "onboarding_step_complete":
      return {
        name: "Onboarding Step Completed",
        properties: { step: event.step },
      };
    case "onboarding_work_status_filled":
      return { name: "Onboarding Work Status Filled" };
    case "onboarding_skip":
      return { name: "Onboarding Skipped", properties: { from: event.from } };
    case "onboarding_finish":
      return { name: "Onboarding Completed" };
    case "settings_open":
      return { name: "Settings Opened" };
    case "settings_notification_change":
      return {
        name: "Settings Notification Changed",
        properties: {
          notification_type: event.notificationType,
          enabled: event.enabled,
        },
      };
    case "settings_interests_save":
      return {
        name: "Settings Interests Saved",
        properties: { count: event.count },
      };
    case "settings_parent_save":
      return { name: "Settings Parent Saved" };
    case "settings_child_add":
      return { name: "Settings Child Added" };
    case "settings_child_update":
      return { name: "Settings Child Updated" };
    case "settings_child_delete":
      return { name: "Settings Child Deleted" };
    case "settings_logout":
      return { name: "Settings Logged Out" };
    case "inquiry_list_view":
      return { name: "Inquiry List Viewed" };
    case "inquiry_form_view":
      return { name: "Inquiry Form Viewed" };
    case "inquiry_submit":
      return {
        name: "Inquiry Submitted",
        properties: { category: event.category ?? "unspecified" },
      };
    case "inquiry_detail_view":
      return {
        name: "Inquiry Detail Viewed",
        properties: { status: event.status },
      };
    case "settings_account_delete_confirm":
      return { name: "Settings Account Deletion Confirmed" };
    case "chat_open":
      return { name: "Chat Opened" };
    case "chat_message_send":
      return {
        name: "Chat Message Sent",
        properties: { length: event.length },
      };
    case "chat_response_first_token":
      return {
        name: "Chat Response First Token",
        properties: { latency_ms: event.latencyMs },
      };
    case "chat_response_complete":
      return {
        name: "Chat Response Completed",
        properties: {
          latency_ms: event.latencyMs,
          card_count: event.cardCount,
          source_count: event.sourceCount,
        },
      };
    case "chat_response_error":
      return { name: "Chat Response Failed" };
    case "chat_quick_reply_use":
      return { name: "Chat Quick Reply Used" };
    case "chat_source_link_open":
      return { name: "Chat Source Link Opened" };
    case "home_view":
      return { name: "Home Viewed" };
    case "home_child_switch":
      return { name: "Home Child Switched" };
    case "home_mood_submit":
      return { name: "Home Mood Submitted" };
    case "home_notification_open":
      return { name: "Home Notification Opened" };
    case "home_notifications_mark_all_read":
      return { name: "Home Notifications Marked All Read" };
    case "home_mission_start_click":
      return { name: "Home Mission Start Clicked" };
    case "home_play_notification_nudge_click":
      return { name: "Home Play Notification Nudge Clicked" };
    case "home_mission_restart":
      return { name: "Home Mission Restarted" };
    case "mission_view":
      return { name: "Mission Viewed" };
    case "mission_start":
      return { name: "Mission Started" };
    case "mission_resume":
      return { name: "Mission Resumed" };
    case "mission_pause":
      return { name: "Mission Paused" };
    case "mission_complete":
      return {
        name: "Mission Completed",
        properties: { completion_type: event.completionType },
      };
    case "mission_feedback_submit":
      return { name: "Mission Feedback Submitted" };
    case "roadmap_view":
      return { name: "Roadmap Viewed" };
    case "roadmap_month_select":
      return { name: "Roadmap Month Selected" };
    case "weekly_report_view":
      return {
        name: "Weekly Report Viewed",
        properties: { has_report: event.hasReport },
      };
    case "weekly_report_mission_start":
      return { name: "Weekly Report Mission Started" };
    case "bottom_nav_tap":
      return { name: "Bottom Nav Tapped", properties: { tab: event.tab } };
  }
}

export function toGoogleAnalyticsEventName(
  event: AnalyticsEvent,
): string | null {
  return event.type === "home_play_notification_nudge_click"
    ? "home_play_notification_nudge_click"
    : null;
}

export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    console.info("[analytics]", event.type, event);
  }

  const googleAnalyticsEventName = toGoogleAnalyticsEventName(event);
  if (googleAnalyticsEventName && process.env.NEXT_PUBLIC_GA_ID) {
    sendGAEvent("event", googleAnalyticsEventName);
  }

  if (!initializeAmplitude()) return;

  const amplitudeEvent = toAmplitudeEvent(event);
  amplitude.track(amplitudeEvent.name, amplitudeEvent.properties);
}

/** Supabase UUID만 사용하고 이메일·이름·자녀 정보는 Amplitude에 보내지 않는다. */
export function setAnalyticsUserId(userId: string): void {
  if (!initializeAmplitude()) return;
  amplitude.setUserId(userId);
}

/** 로그아웃 또는 계정 탈퇴 뒤 이전 사용자와 이후 익명 활동의 연결을 끊는다. */
export function resetAnalyticsIdentity(): void {
  if (!initializeAmplitude()) return;
  amplitude.reset();
}

/** Performance payloads contain only technical metadata, never domain records. */
export function trackPerformance(
  name: string,
  fields: Record<string, string | number | boolean>,
): void {
  if (process.env.NODE_ENV !== "production")
    console.info("[performance]", name, fields);
  if (initializeAmplitude()) amplitude.track(`Performance ${name}`, fields);
}
