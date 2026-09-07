"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AppHeader, HeaderSpacer } from "@/components/app/app-header";
import { track } from "@/lib/analytics";
import { useScreenPerformance } from "@/hooks/use-screen-performance";
import {
  getStoredSelectedChildId,
  loadWeeklyReport,
  markWeeklyReportViewed,
  type WeeklyReportLoadState,
} from "@/lib/api";
import {
  type WeeklyReportDetail,
  type WeeklyReportViewData,
} from "@/lib/weekly-report-data";
import {
  BestMomentSection,
  DurationStat,
  InnerStateSection,
  KeywordSection,
  PercentStat,
  ReportCard,
  ReportSection,
} from "./sections";
import {
  WeeklyReportEmpty,
  WeeklyReportError,
  WeeklyReportSkeleton,
} from "./states";

export const WeeklyReportScreen = () => {
  const router = useRouter();
  const [state, setState] = useState<WeeklyReportLoadState | null>(null);
  const [loading, setLoading] = useState(true);
  useScreenPerformance(
    "/weekly-report",
    loading
      ? "pending"
      : state?.error
        ? "error"
        : state?.data
          ? "api"
          : "pending",
  );

  const requestReport = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get("reportId");
    return loadWeeklyReport({
      childId: getStoredSelectedChildId(),
      reportId,
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const next = await requestReport();
    setState(next);
    setLoading(false);
    if (next.data?.report) {
      void markWeeklyReportViewed(next.data.report.id);
    }
  }, [requestReport]);

  useEffect(() => {
    let active = true;
    void requestReport().then((next) => {
      if (!active) return;
      setState(next);
      setLoading(false);
      if (next.data?.report) {
        void markWeeklyReportViewed(next.data.report.id);
      }
      track({
        type: "weekly_report_view",
        hasReport: Boolean(next.data?.report),
      });
    });
    return () => {
      active = false;
    };
  }, [requestReport]);

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  const startMission = () => {
    track({ type: "weekly_report_mission_start" });
    router.push("/mission");
  };

  return (
    <div className="fixed inset-0 z-40 mx-auto flex h-dvh w-full max-w-107.5 flex-col bg-gray-20 text-gray-800">
      <AppHeader
        fixed
        title="주간 리포트"
        onBack={goBack}
        right={
          <button
            type="button"
            className="flex size-11 items-center justify-center text-gray-800"
            aria-label="알림 열기"
          >
            {/* 홈 헤더와 동일한 Figma 알림 아이콘으로 통일 */}
            <img
              src="/icons/figma/home/header-notification.svg"
              alt=""
              className="size-6"
              aria-hidden
            />
          </button>
        }
      />
      <HeaderSpacer />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {loading ? (
          <WeeklyReportSkeleton />
        ) : state?.error ? (
          <WeeklyReportError error={state.error} onRetry={load} />
        ) : state?.data ? (
          <WeeklyReportContent
            data={state.data}
            onStartMission={startMission}
          />
        ) : null}
      </div>
    </div>
  );
};

const WeeklyReportContent = ({
  data,
  onStartMission,
}: {
  data: WeeklyReportViewData;
  onStartMission: () => void;
}) => {
  if (!data.report) {
    return (
      <WeeklyReportEmpty
        emptyState={data.emptyState}
        onStartMission={onStartMission}
      />
    );
  }

  return <WeeklyReportDetailView report={data.report} />;
};

const WeeklyReportDetailView = ({ report }: { report: WeeklyReportDetail }) => (
  <div className="flex flex-1 flex-col gap-8 px-5 pb-12 pt-5">
    <ReportSection title={report.headline.question}>
      <ReportCard>
        <h2 className="text-base font-bold leading-[22px]">
          {report.headline.title}
        </h2>
        {report.headline.body ? (
          <p className="mt-3.75 text-sm leading-5 text-gray-500">
            {report.headline.body}
          </p>
        ) : null}
      </ReportCard>
    </ReportSection>

    <ReportSection title="이번주 요약">
      <div className="flex flex-col gap-2">
        <ReportCard>
          <p className="text-sm font-semibold leading-4">이번주 미션 현황</p>
          <div className="mt-3.75 flex items-center justify-between">
            {report.missionSummary.days.map((day) => (
              <div
                key={day.weekday}
                className="flex w-8.5 flex-col items-center gap-1"
              >
                <span
                  className={`flex size-8 items-center justify-center rounded-full ${
                    day.completed
                      ? "bg-primary-300 text-white"
                      : "border border-gray-200 bg-white text-gray-300"
                  }`}
                  aria-label={`${day.label}요일 완료 미션 ${day.completedCount}개`}
                >
                  {day.completed ? (
                    <Check className="size-4.5" aria-hidden />
                  ) : null}
                </span>
                <span className="text-xs leading-[15px] text-gray-500">
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </ReportCard>
        <div className="grid grid-cols-2 gap-2">
          <DurationStat
            label="누적 미션 수행시간"
            value={report.missionSummary.totalDurationLabel}
          />
          <PercentStat
            label="아이 반응 긍정률"
            value={report.missionSummary.childPositiveReactionRate}
          />
        </div>
      </div>
    </ReportSection>

    <KeywordSection report={report} />
    <BestMomentSection moments={report.bestMoments} />
    <InnerStateSection report={report} />
    <ReportCard>
      <div className="flex items-center gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/figma/report/ai-suggestion.svg"
          alt=""
          className="size-4.5"
          aria-hidden
        />
        <h2 className="text-base font-bold leading-6">
          {report.aiActionSuggestion.title}
        </h2>
      </div>
      <p className="mt-3.75 text-sm leading-5 text-gray-500">
        {report.aiActionSuggestion.body}
      </p>
    </ReportCard>
  </div>
);
