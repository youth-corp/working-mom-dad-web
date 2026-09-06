import { ChevronRight } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Mascot } from "@/components/characters/mascot";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import type { HomeDashboard as HomeDashboardData } from "@/lib/home-data";
import type { WeeklyReportCountdown } from "@/lib/report-progress";
import { splitMissionTitle } from "./helpers";

export const ReportProgressBanner = ({
  countdown,
  streak,
}: {
  countdown: WeeklyReportCountdown;
  streak: number;
}) => (
  <div className="flex min-h-12 items-center justify-between gap-3 rounded-full bg-primary-50 px-4">
    <div className="flex min-w-0 items-center gap-2">
      <Image
        src="/images/figma/home/star-shine.png"
        alt=""
        width={15}
        height={13}
        className="shrink-0"
      />
      <p className="truncate text-sm font-medium text-gray-800">
        {countdown.kind === "generation_tomorrow"
          ? "주간 리포트가 내일 아침에 생성돼요."
          : `주간 리포트 생성까지 ${countdown.daysRemaining}일 남았어요!`}
      </p>
    </div>
    <span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-semibold text-primary-300">
      🔥 {streak}일 연속
    </span>
  </div>
);

export const TodayMissionCard = ({
  mission,
  loading,
  showNotificationNudge,
  onStart,
  onNotification,
}: {
  mission: HomeDashboardData["recommendedMission"];
  loading: boolean;
  showNotificationNudge: boolean;
  onStart: () => void;
  onNotification: () => void;
}) => {
  const isCompleted = mission?.status === "completed";

  return (
    <Card
      radius="xxl"
      shadow="none"
      className="flex flex-col gap-5 rounded-[28px] px-6 py-7 shadow-[0_8px_28px_rgba(38,38,38,0.05)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-2">
          <Chip>아이 {mission?.durationMinutes ?? 10}분 가까워지기</Chip>
          <h2 className="text-[20px] font-bold leading-[1.45] tracking-[-0.4px] text-gray-800">
            {splitMissionTitle(
              mission?.title ?? "아이와 눈을 마주치며 이야기를 해보아요",
            ).map((line) => (
              <span key={line} className="block whitespace-pre-wrap">
                {line}
              </span>
            ))}
          </h2>
        </div>
        <Mascot pose="reading" className="w-20 shrink-0" />
      </div>
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onStart}
          disabled={!mission || loading || isCompleted}
          className="flex h-13 w-full items-center justify-center rounded-2xl bg-primary-300 text-base font-medium text-white disabled:bg-gray-100 disabled:text-gray-600"
        >
          {isCompleted ? "오늘의 놀이 완료" : "오늘의 놀이 시작하기"}
        </button>
        {showNotificationNudge ? (
          <p className="text-center text-xs text-gray-500">
            지금 어려우신가요?{" "}
            <button
              type="button"
              onClick={onNotification}
              className="font-semibold text-primary-300"
            >
              편한 시간에 알림 받기
            </button>
          </p>
        ) : null}
      </div>
    </Card>
  );
};

// 홈 카드가 보여주는 수치는 항상 "지난주" 리포트다. 이번 주에 막 시작한
// 사용자가 0회를 오늘 기록이 누락된 것으로 오해하지 않도록 주차를 명시하고,
// 지난주 리포트 자체가 없으면 생성 시점을 안내한다.
const reportSummaryDescription = (
  reportSummary: HomeDashboardData["reportSummary"],
  countdown: WeeklyReportCountdown,
) => {
  if (reportSummary) {
    return `지난주 놀이 ${reportSummary.completedPlayCount}회 · 아이 반응 ${reportSummary.childPositiveReactionRate}%`;
  }

  return countdown.kind === "generation_tomorrow"
    ? "첫 리포트가 내일 아침에 생성돼요"
    : `첫 리포트까지 ${countdown.daysRemaining}일 남았어요`;
};

export const HomeShortcutCards = ({
  roadmapProgress,
  reportSummary,
  reportCountdown,
  onRoadmap,
  onReport,
}: {
  roadmapProgress: HomeDashboardData["roadmapProgress"];
  reportSummary: HomeDashboardData["reportSummary"];
  reportCountdown: WeeklyReportCountdown;
  onRoadmap: () => void;
  onReport: () => void;
}) => (
  <section className="grid grid-cols-2 gap-3 px-2">
    <ShortcutCard
      title="로드맵"
      description={
        <>
          발달체크 항목{" "}
          <span className="font-semibold text-primary-300">
            {roadmapProgress.completedCount}
          </span>
          /{roadmapProgress.totalCount}개
        </>
      }
      onClick={onRoadmap}
    />
    <ShortcutCard
      title="주간리포트"
      description={reportSummaryDescription(reportSummary, reportCountdown)}
      onClick={onReport}
    />
  </section>
);

const ShortcutCard = ({
  title,
  description,
  onClick,
}: {
  title: string;
  description: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-24 flex-col items-start justify-center rounded-[24px] bg-white p-4 text-left shadow-[0_8px_28px_rgba(38,38,38,0.04)]"
  >
    <span className="flex w-full items-center justify-between text-[17px] font-bold text-gray-800">
      {title}
      <ChevronRight className="size-5" strokeWidth={2} aria-hidden />
    </span>
    <span className="mt-1 whitespace-nowrap text-xs text-gray-500">
      {description}
    </span>
  </button>
);

export const AiConsultationCard = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex min-h-16 w-full items-center justify-between rounded-[24px] bg-white px-5 shadow-[0_8px_28px_rgba(38,38,38,0.04)]"
  >
    <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
      <Image
        src="/images/figma/home/question-mark.png"
        alt=""
        width={14}
        height={15.48}
      />
      궁금한게 있으면 Ai 에게 물어보세요
    </span>
    <ChevronRight
      className="size-5 text-gray-800"
      strokeWidth={2}
      aria-hidden
    />
  </button>
);
