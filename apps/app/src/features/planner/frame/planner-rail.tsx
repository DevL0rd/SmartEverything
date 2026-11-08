import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import type { RailWidth } from '../../../components/frame-layout';
import { SectionRail, type RailEntry } from '../../../components/section-rail';
import { Text } from '../../../components/text';
import {
  usePlannerDay,
  usePlannerItems,
  usePlannerStats,
  usePlannerSummary,
  useVisibleMinute,
} from '../data';
import type { PlannerSection } from '../model/section-routes';
import { usePlannerShownPerson } from './person';
import {
  calendarSummaryOf,
  insightsSummaryOf,
  tasksSummaryOf,
  todaySummaryOf,
} from './rail-summary';
import { PLANNER_SECTION_DEFS, plannerHrefOf } from './sections';
import { dayKeyOf } from '../../../format/time';

function SummaryText({ text }: { readonly text: string | null }): ReactNode {
  return text === null ? null : (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

function TodaySummary(): ReactNode {
  return <SummaryText text={todaySummaryOf(usePlannerSummary(usePlannerShownPerson()))} />;
}

function TasksSummary(): ReactNode {
  return <SummaryText text={tasksSummaryOf(usePlannerItems(usePlannerShownPerson()))} />;
}

function CalendarSummary(): ReactNode {
  const ref = useRef<View>(null);
  const { value: now, onLayout } = useVisibleMinute(ref);
  const day = usePlannerDay(usePlannerShownPerson(), dayKeyOf(now)).data ?? null;
  return (
    <View ref={ref} onLayout={onLayout}>
      <SummaryText text={calendarSummaryOf(day, now)} />
    </View>
  );
}

function InsightsSummary(): ReactNode {
  const stats = usePlannerStats(usePlannerShownPerson(), 'week').data ?? null;
  return <SummaryText text={insightsSummaryOf(stats)} />;
}

const SUMMARY: Readonly<Record<PlannerSection, () => ReactNode>> = {
  index: TodaySummary,
  tasks: TasksSummary,
  calendar: CalendarSummary,
  insights: InsightsSummary,
};

const ENTRIES: readonly RailEntry[] = PLANNER_SECTION_DEFS.map((def) => {
  const Summary = SUMMARY[def.id];
  return {
    id: def.id,
    label: def.label,
    icon: def.icon,
    missing: null,
    detail: <Summary />,
  };
});

export function PlannerRail({
  active,
  width,
}: {
  readonly active: PlannerSection;
  readonly width: RailWidth;
}): ReactNode {
  return (
    <SectionRail
      groups={[{ title: null, entries: ENTRIES }]}
      active={active}
      width={width}
      hrefOf={plannerHrefOf}
    />
  );
}
