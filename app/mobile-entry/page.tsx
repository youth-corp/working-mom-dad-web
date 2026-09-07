"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useEffectEvent, useRef } from "react";
import { useOnboardingDraft } from "@/hooks/use-onboarding-draft";
import { ApiError, api } from "@/lib/api";
import { getOnboardingResumePath } from "@/lib/onboarding-draft";
import { waitForServerSession } from "@/lib/server-session-ready";
import {
  isNativeWebView,
  notifyMobile,
  subscribeToNativeMessages,
} from "@/lib/native-bridge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { markNativeHomeEntry, reportPerformance } from "@/lib/performance";

export default function MobileEntryPage() {
  const { draft } = useOnboardingDraft();
  const resolvedRef = useRef(false);

  const goToIntro = useEffectEvent(() => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    window.location.replace("/onboarding/intro");
  });

  const goToAuthenticatedStart = useEffectEvent(async () => {
    if (resolvedRef.current) return;

    try {
      const me = await api.getMe();
      resolvedRef.current = true;
      if (me.onboardedAt) {
        markNativeHomeEntry();
        reportPerformance("mobile_entry_redirect", {
          duration_ms: performance.now(),
          destination: "home",
        });
        window.location.replace("/");
        return;
      }

      window.location.replace(getOnboardingResumePath(draft));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        goToIntro();
        return;
      }

      resolvedRef.current = true;
      window.location.replace(getOnboardingResumePath(draft));
    }
  });

  useEffect(() => {
    resolvedRef.current = false;

    if (!isNativeWebView()) {
      goToIntro();
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const fallbackTimeoutId = window.setTimeout(() => {
      void supabase.auth
        .getSession()
        .then(async ({ data }: { data: { session: Session | null } }) => {
          if (!data.session) {
            goToIntro();
            return;
          }

          await waitForServerSession();
          await goToAuthenticatedStart();
        });
    }, 1000);

    const unsubscribe = subscribeToNativeMessages((message) => {
      if (resolvedRef.current) return;

      if (message.type === "SUPABASE_SESSION_CLEARED") {
        window.clearTimeout(fallbackTimeoutId);
        goToIntro();
        return;
      }

      if (message.type !== "SUPABASE_SESSION_SYNC") return;

      window.clearTimeout(fallbackTimeoutId);
      void (async () => {
        const started = performance.now();
        await supabase.auth.setSession({
          access_token: message.payload.accessToken,
          refresh_token: message.payload.refreshToken,
        });
        reportPerformance("web_session_sync", {
          duration_ms: performance.now() - started,
        });
        await waitForServerSession();
        await goToAuthenticatedStart();
      })();
    });

    notifyMobile({ type: "WEB_READY" });

    return () => {
      window.clearTimeout(fallbackTimeoutId);
      unsubscribe();
    };
  }, [draft]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-primary-200 border-t-primary-500" />
        <div className="space-y-1">
          <p className="text-base font-semibold text-gray-800">
            육아벨을 준비하고 있어요
          </p>
          <p className="text-sm text-gray-500">잠시만 기다려 주세요</p>
        </div>
      </div>
    </div>
  );
}
