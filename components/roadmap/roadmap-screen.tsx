"use client";

import { Check, ChevronLeft, ChevronRight, Info, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader, HeaderSpacer } from "@/components/app/app-header";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { SectionInfoCard } from "@/components/ui/section-info-card";
import {
  getStoredSelectedChildId,
  loadRoadmap,
  setRoadmapMilestoneCompletion,
} from "@/lib/api";
import { track } from "@/lib/analytics";
import { useScreenPerformance } from "@/hooks/use-screen-performance";
import {
  CDC_CHECKPOINTS,
  ROADMAP_CATEGORY_DISPLAY,
  type RoadmapCategoryGroup,
  type RoadmapResponse,
  type RoadmapStage,
  updateRoadmapMilestoneCompletion,
} from "@/lib/roadmap-data";

export const RoadmapScreen = () => {
  const router = useRouter();
  const [data, setData] = useState<RoadmapResponse | null>(null);
  // 내 아이의 월령 체크포인트 — 첫 로드 시 서버가 보정해 준 targetMonth로 고정.
  // 이후 월령 탭을 옮겨도 바뀌지 않으므로, 다른 월령을 보고 있을 때 내 아이 탭을 표시하는 기준이 된다.
  const [childMonth, setChildMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<"api" | "demo">("demo");
  useScreenPerformance("/roadmap", loading || !data ? "pending" : source);
  const [pendingMilestoneIds, setPendingMilestoneIds] = useState<Set<string>>(
    new Set(),
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const infoButtonRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async (targetMonth?: number | null) => {
    setLoading(true);
    const next = await loadRoadmap({
      childId: getStoredSelectedChildId(),
      targetMonth,
    });
    setData(next.data);
    setSource(next.source);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void loadRoadmap({ childId: getStoredSelectedChildId() }).then((next) => {
      if (!active) return;
      setData(next.data);
      setSource(next.source);
      setChildMonth(next.data.targetMonth);
      setLoading(false);
      track({ type: "roadmap_view" });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!tooltipOpen) return;
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (tooltipRef.current?.contains(target)) return;
      if (infoButtonRef.current?.contains(target)) return;
      setTooltipOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [tooltipOpen]);

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  };

  const onSelectMonth = (month: number) => {
    if (!data || data.targetMonth === month) return;
    track({ type: "roadmap_month_select" });
    void load(month);
  };

  const onToggleMilestone = async (milestoneId: string, completed: boolean) => {
    if (!data || pendingMilestoneIds.has(milestoneId)) return;

    setSaveError(null);
    setData(updateRoadmapMilestoneCompletion(data, milestoneId, completed));

    if (source === "demo") return;

    setPendingMilestoneIds((current) => new Set(current).add(milestoneId));
    try {
      await setRoadmapMilestoneCompletion({
        childId: data.child.id,
        milestoneId,
        completed,
      });
    } catch {
      setData((current) =>
        current
          ? updateRoadmapMilestoneCompletion(current, milestoneId, !completed)
          : current,
      );
      setSaveError(
        "체크 상태를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setPendingMilestoneIds((current) => {
        const next = new Set(current);
        next.delete(milestoneId);
        return next;
      });
    }
  };

  if (!data) return <RoadmapSkeleton />;

  const milestoneItems = data.milestonesByCategory.flatMap(
    (group) => group.items,
  );
  const completedMilestoneCount = milestoneItems.filter(
    (item) => item.completed,
  ).length;

  return (
    <div className="flex min-h-dvh flex-col bg-gray-20 text-gray-800">
      <AppHeader
        fixed
        title="발달 로드맵"
        onBack={goBack}
        right={
          <button
            ref={infoButtonRef}
            type="button"
            onClick={() => setTooltipOpen((value) => !value)}
            className="flex size-11 items-center justify-center text-gray-800"
            aria-label="데이터 출처 안내"
          >
            <Info className="size-6" aria-hidden />
          </button>
        }
      />
      <HeaderSpacer />
      <div className="relative flex flex-1 flex-col">
        {tooltipOpen ? (
          <SourceTooltip
            text={data.sourceTooltip.text}
            tooltipRef={tooltipRef}
          />
        ) : null}
        <CurrentStageCard
          ageLabel={data.child.ageLabel}
          stage={data.stage}
          completedCount={completedMilestoneCount}
          totalCount={milestoneItems.length}
        />
        <MonthTabs
          target={data.targetMonth}
          childMonth={childMonth}
          disabled={loading}
          onSelect={onSelectMonth}
        />
        <CategoryCardList
          groups={data.milestonesByCategory}
          pendingMilestoneIds={pendingMilestoneIds}
          onToggle={onToggleMilestone}
        />
        <p
          aria-live="polite"
          className="min-h-5 px-5 pb-3 text-center text-xs text-error-500"
        >
          {saveError}
        </p>
      </div>
    </div>
  );
};

const SourceTooltip = ({
  text,
  tooltipRef,
}: {
  text: string;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
}) => (
  <div className="absolute right-5 top-2 z-10" role="status">
    <div
      className="pointer-events-none absolute right-2.5 -top-1.75 size-0 border-x-[13px] border-b-[12px] border-x-transparent border-b-white"
      aria-hidden
    />
    <div
      ref={tooltipRef}
      className="pointer-events-auto w-67.75 rounded-2xl bg-white px-4 py-2 shadow-[0_4px_20px_rgba(0,0,0,0.12)]"
    >
      <p className="text-xs leading-5 text-gray-600">{text}</p>
    </div>
  </div>
);

const CurrentStageCard = ({
  ageLabel,
  stage,
  completedCount,
  totalCount,
}: {
  ageLabel: string;
  stage: RoadmapStage | null;
  completedCount: number;
  totalCount: number;
}) => (
  <section className="px-5 pt-5">
    <SectionInfoCard
      icon={
        <Star
          className="size-5 text-primary-300"
          fill="currentColor"
          strokeWidth={0}
          aria-hidden
        />
      }
      label={stage?.name ?? "확인 중"}
      title={ageLabel.endsWith("개월") ? `${ageLabel} 차` : ageLabel}
      belowTitle={
        <ChecklistProgress
          completedCount={completedCount}
          totalCount={totalCount}
        />
      }
      body={
        stage?.summary ??
        "아이의 성장 단계를 확인하는 중이에요. 잠시만 기다려주세요."
      }
    />
  </section>
);

const ChecklistProgress = ({
  completedCount,
  totalCount,
}: {
  completedCount: number;
  totalCount: number;
}) => {
  const progress =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);

  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-xs font-medium leading-5">
        <span className="text-gray-500">체크리스트</span>
        <span className="font-bold text-primary-400">{progress}%</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-label="체크리스트 완료율"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <div
          className="h-full rounded-full bg-primary-300 transition-[width]"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

const MonthTabs = ({
  target,
  childMonth,
  disabled,
  onSelect,
}: {
  target: number;
  childMonth: number | null;
  disabled: boolean;
  onSelect: (month: number) => void;
}) => {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const targetIndex = (CDC_CHECKPOINTS as readonly number[]).indexOf(target);
  const prevMonth = targetIndex > 0 ? CDC_CHECKPOINTS[targetIndex - 1] : null;
  const nextMonth =
    targetIndex >= 0 && targetIndex < CDC_CHECKPOINTS.length - 1
      ? CDC_CHECKPOINTS[targetIndex + 1]
      : null;

  // 선택된 월령이 바뀌면 가로 스크롤에서 가운데로 보이도록 이동.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [target]);

  return (
    <section className="mt-5 px-5">
      <h2 className="text-lg font-bold leading-[25px] text-gray-800">
        발달 지표
      </h2>
      <div
        role="tablist"
        aria-label="월령 선택"
        className="mt-3 flex items-center gap-1"
      >
        <button
          type="button"
          onClick={() => prevMonth !== null && onSelect(prevMonth)}
          disabled={prevMonth === null || disabled}
          aria-label="이전 월령 보기"
          className="flex size-8 shrink-0 items-center justify-center text-gray-800 disabled:text-gray-300"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <div className="no-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {CDC_CHECKPOINTS.map((month) => {
            const active = month === target;
            // 지금 보고 있는 월령(active)이 아니면서 내 아이 월령인 탭은 연한 색으로 구분.
            const isChildMonth = !active && month === childMonth;
            return (
              <button
                key={month}
                ref={active ? activeRef : undefined}
                type="button"
                role="tab"
                aria-selected={active}
                title={isChildMonth ? "내 아이 월령" : undefined}
                onClick={() => onSelect(month)}
                disabled={disabled}
                className={`flex h-8.25 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3.5 text-xs font-medium leading-[1.4] ${
                  active
                    ? "bg-primary-300 text-white"
                    : isChildMonth
                      ? "border border-primary-200 bg-primary-50 text-primary-300"
                      : "border border-gray-100 bg-white text-gray-600"
                }`}
              >
                {month}개월
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => nextMonth !== null && onSelect(nextMonth)}
          disabled={nextMonth === null || disabled}
          aria-label="다음 월령 보기"
          className="flex size-8 shrink-0 items-center justify-center text-gray-800 disabled:text-gray-300"
        >
          <ChevronRight className="size-6" aria-hidden />
        </button>
      </div>
    </section>
  );
};

const CategoryCardList = ({
  groups,
  pendingMilestoneIds,
  onToggle,
}: {
  groups: RoadmapCategoryGroup[];
  pendingMilestoneIds: Set<string>;
  onToggle: (milestoneId: string, completed: boolean) => void;
}) => (
  <section className="mt-5 flex flex-col gap-5 px-5 pb-8">
    {groups.map((group) => (
      <CategoryCard
        key={group.categoryId}
        group={group}
        pendingMilestoneIds={pendingMilestoneIds}
        onToggle={onToggle}
      />
    ))}
  </section>
);

// Figma 카테고리 색 = Chip tone (15% 알파 + inset glow): social=amber/language=blue/cognitive=purple/physical=cyan
const CATEGORY_TONE: Record<
  string,
  "amber" | "blue" | "purple" | "cyan" | "gray"
> = {
  social: "amber",
  language: "blue",
  cognitive: "purple",
  physical: "cyan",
};

const CategoryCard = ({
  group,
  pendingMilestoneIds,
  onToggle,
}: {
  group: RoadmapCategoryGroup;
  pendingMilestoneIds: Set<string>;
  onToggle: (milestoneId: string, completed: boolean) => void;
}) => {
  const tone = CATEGORY_TONE[group.categoryId] ?? "gray";
  const fallback = ROADMAP_CATEGORY_DISPLAY[group.categoryId];
  const completedCount = group.items.filter((item) => item.completed).length;

  return (
    <Card
      padding="none"
      radius="xxl"
      shadow="none"
      className="border border-gray-50 p-5"
      aria-labelledby={`category-${group.categoryId}`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Chip
            shape="square"
            tone={tone}
            className="size-6 shrink-0 justify-center"
            style={{ borderRadius: 10, padding: 3 }}
            aria-hidden
          >
            <CategoryIcon iconKey={group.iconKey || fallback.iconKey} />
          </Chip>
          <h3
            id={`category-${group.categoryId}`}
            className="truncate text-sm font-bold leading-5 text-gray-800"
          >
            {group.categoryLabel || fallback.label}
          </h3>
        </div>
        <span
          className="shrink-0 text-xs font-medium leading-5 text-gray-800"
          aria-label={`${group.items.length}개 중 ${completedCount}개 완료`}
        >
          <span className="font-bold text-primary-300">{completedCount}</span>/
          {group.items.length}
        </span>
      </div>
      <div className="my-5 h-px bg-gray-50" />
      {group.items.length === 0 ? (
        <p className="text-sm leading-5 text-gray-400">
          이 월령의 자료가 곧 추가됩니다.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {group.items.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <div className="flex shrink-0 p-[3px]">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.completed}
                  aria-label={`${item.description} ${item.completed ? "체크 해제" : "체크"}`}
                  disabled={pendingMilestoneIds.has(item.id)}
                  onClick={() => onToggle(item.id, !item.completed)}
                  className={`flex size-4.5 items-center justify-center rounded-xs border transition-colors disabled:opacity-60 ${
                    item.completed
                      ? "border-primary-400 bg-primary-400 text-white"
                      : "border-gray-200 bg-white text-transparent"
                  }`}
                >
                  <Check className="size-3" strokeWidth={3} aria-hidden />
                </button>
              </div>
              <span className="text-sm font-normal leading-5 text-gray-600">
                {item.description}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

/**
 * Figma chip 아이콘 (Material Symbols 이름). Figma 노드 2516:5396/5407/5418/5429에서 export.
 * 알 수 없는 키는 안전한 빈 표시 (•).
 */
const ICON_PATHS: Record<string, string> = {
  groups: "/icons/figma/roadmap/groups.svg",
  dictionary: "/icons/figma/roadmap/dictionary.svg",
  psychology_alt: "/icons/figma/roadmap/psychology_alt.svg",
  barefoot: "/icons/figma/roadmap/barefoot.svg",
};

const CategoryIcon = ({ iconKey }: { iconKey: string }) => {
  const src = ICON_PATHS[iconKey];
  if (!src) {
    return (
      <span
        className="text-xs font-bold leading-none text-gray-400"
        aria-hidden
      >
        •
      </span>
    );
  }
  // <img>로 두면 flex 안에서 width가 눌리거나 SVG의 width/height="100%" 탓에
  // 박스보다 작게 렌더링됐다. 고정 정사각 박스에 배경 이미지로 깔아
  // (bg-contain) replaced-element 사이징 이슈를 우회한다.
  return (
    <span
      role="img"
      aria-hidden
      className="block size-full shrink-0 bg-contain bg-center bg-no-repeat"
      style={{ backgroundImage: `url("${src}")` }}
    />
  );
};

const RoadmapSkeleton = () => (
  <div className="flex min-h-dvh items-center justify-center bg-gray-20">
    <div className="size-8 animate-pulse rounded-full bg-primary-300" />
  </div>
);
