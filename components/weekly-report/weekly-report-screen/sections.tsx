import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { StatCard, StatValue } from "@/components/ui/stat-card";
import {
  splitDurationLabel,
  type WeeklyReportDetail,
} from "@/lib/weekly-report-data";
import { keywordIcons, keywordTones } from "./constants";

export const ReportSection = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-lg font-bold leading-[25px]">{title}</h2>
    {children}
  </section>
);

// 리포트 카드 = 공통 Card (Figma: 흰배경 radius 20, shadow-1, padding 24)
export const ReportCard = ({ children }: { children: React.ReactNode }) => (
  <Card>{children}</Card>
);

// 누적 수행시간 통계 ("1시간 17분" → SUIT 32px 숫자)
export const DurationStat = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <StatCard label={label} align="start">
    {splitDurationLabel(value).map((segment) => (
      <StatValue
        key={`${segment.value}-${segment.unit}`}
        value={segment.value}
        unit={segment.unit}
        size="lg"
      />
    ))}
  </StatCard>
);

// 긍정률 통계 (불꽃 + SUIT 32px + %)
export const PercentStat = ({
  label,
  value,
}: {
  label: string;
  value: number;
}) => (
  <StatCard
    label={label}
    align="start"
    icon={
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/icons/figma/shared/positive-rate.svg"
        alt=""
        className="size-4.5 self-center"
        aria-hidden
      />
    }
  >
    <StatValue value={value} unit="%" size="lg" />
  </StatCard>
);

export const KeywordSection = ({ report }: { report: WeeklyReportDetail }) => (
  <section className="flex flex-col gap-3">
    <h2 className="text-lg font-bold leading-[25px]">
      아이의 관심 키워드 Top 3
    </h2>
    {report.topKeywords.length > 0 ? (
      <div className="flex flex-wrap items-center gap-3">
        {report.topKeywords.map((keyword, index) => {
          const iconSrc = keywordIcons[index] ?? keywordIcons[0];
          return (
            <Chip
              key={`${keyword.rank}-${keyword.keyword}`}
              shape="square"
              tone={keywordTones[index] ?? "amber"}
              size="md"
              className="font-semibold"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={iconSrc}
                alt=""
                className="size-3.5 shrink-0"
                aria-hidden
              />
              {keyword.keyword}
            </Chip>
          );
        })}
      </div>
    ) : report.keywordEmptyState ? (
      <Card padding="md">
        <p className="text-sm font-bold leading-5">
          {report.keywordEmptyState.title}
        </p>
        <p className="mt-2 text-sm leading-5 text-gray-500">
          {report.keywordEmptyState.description}
        </p>
      </Card>
    ) : null}
  </section>
);

export const BestMomentSection = ({
  moments,
}: {
  moments: WeeklyReportDetail["bestMoments"];
}) => {
  const firstMoment = moments[0];

  if (!firstMoment) return null;

  return (
    <ReportSection title="아이의 ‘베스트 모먼트’">
      <div className="flex flex-col items-center gap-3">
        <ReportCard>
          {firstMoment.label ? (
            <p className="text-xs font-medium leading-[17px] text-gray-600">
              {firstMoment.label}
            </p>
          ) : null}
          <h2 className="mt-1 text-base font-bold leading-6">
            {firstMoment.title}
          </h2>
          <p className="mt-3.75 text-sm leading-5 text-gray-500">
            {firstMoment.body}
          </p>
        </ReportCard>
        {moments.length > 1 ? (
          <div className="flex h-1.5 items-center gap-1">
            {moments.map((moment, index) => (
              <span
                key={moment.id}
                className={`h-1.5 rounded-full ${
                  index === 0 ? "w-6 bg-black" : "w-1.5 bg-gray-200"
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </ReportSection>
  );
};

export const InnerStateSection = ({
  report,
}: {
  report: WeeklyReportDetail;
}) => (
  <ReportSection title="사용자의 내면 상태">
    <ReportCard>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium leading-[17px] text-gray-600">
          심리적 에너지
        </p>
        <p className="text-base font-bold leading-6">
          {report.innerState.psychologicalEnergy}%
        </p>
      </div>
      <div
        className="mt-3.75 h-5 overflow-hidden rounded-full bg-[rgba(0,0,0,0.03)]"
        role="progressbar"
        aria-valuenow={report.innerState.psychologicalEnergy}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-xs bg-primary-300"
          style={{ width: `${report.innerState.psychologicalEnergy}%` }}
        />
      </div>
      <p className="mt-3.75 text-sm font-medium leading-[22px] text-gray-500">
        {report.innerState.tipTitle}
      </p>
      {report.innerState.tipBody ? (
        <p className="mt-2 text-sm leading-5 text-gray-500">
          {report.innerState.tipBody}
        </p>
      ) : null}
    </ReportCard>
  </ReportSection>
);
