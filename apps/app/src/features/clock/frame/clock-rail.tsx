import { useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import type { RailWidth } from '../../../components/frame-layout';
import { SectionRail, type RailEntry } from '../../../components/section-rail';
import { Text } from '../../../components/text';
import { useVisibleLive } from '../../../design/use-visible-live';
import { useSecondOf } from '../../../store/clock';
import {
  usePlannerPreferences,
  usePlannerStopwatch,
  usePlannerSummary,
  usePlannerTimers,
  useVisibleMinuteOf,
} from '../../planner/data';
import type { ClockSection } from '../model/section-routes';
import {
  alarmSummaryOf,
  hasRunningTimer,
  stopwatchSummaryOf,
  timerSummaryOf,
  worldSummaryOf,
} from './rail-summary';
import { CLOCK_SECTION_DEFS, clockHrefOf } from './sections';

const ME = null;

function SummaryText({ text }: { readonly text: string | null }): ReactNode {
  return text === null ? null : (
    <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
      {text}
    </Text>
  );
}

function MinuteSummary({ select }: { readonly select: (now: number) => string | null }): ReactNode {
  const ref = useRef<View>(null);
  const { value, onLayout } = useVisibleMinuteOf(ref, select);
  return (
    <View ref={ref} onLayout={onLayout}>
      <SummaryText text={value} />
    </View>
  );
}

interface SecondProps {
  readonly select: (now: number) => string | null;
  readonly ticking: boolean;
}

function SecondSummary({ select, ticking }: SecondProps): ReactNode {
  const ref = useRef<View>(null);
  const { live, onLayout } = useVisibleLive(ref);
  const text = useSecondOf(select, ticking && live);
  return (
    <View ref={ref} onLayout={onLayout}>
      <SummaryText text={text} />
    </View>
  );
}

function AlarmSummary(): ReactNode {
  const next = usePlannerSummary(ME)?.nextAlarmAt ?? null;
  return <MinuteSummary select={(now) => alarmSummaryOf(next, now)} />;
}

function TimerSummary(): ReactNode {
  const timers = usePlannerTimers(ME);
  return (
    <SecondSummary
      select={(now) => timerSummaryOf(timers, now)}
      ticking={hasRunningTimer(timers)}
    />
  );
}

function StopwatchSummary(): ReactNode {
  const stopwatch = usePlannerStopwatch(ME);
  return (
    <SecondSummary
      select={(now) => stopwatchSummaryOf(stopwatch, now)}
      ticking={stopwatch?.running === true}
    />
  );
}

function WorldSummary(): ReactNode {
  const clocks = usePlannerPreferences(ME).data?.clock.world_clocks ?? [];
  return <MinuteSummary select={(now) => worldSummaryOf(clocks, now)} />;
}

const SUMMARY: Readonly<Record<ClockSection, () => ReactNode>> = {
  index: AlarmSummary,
  timers: TimerSummary,
  stopwatch: StopwatchSummary,
  world: WorldSummary,
};

const ENTRIES: readonly RailEntry[] = CLOCK_SECTION_DEFS.map((def) => {
  const Summary = SUMMARY[def.id];
  return {
    id: def.id,
    label: def.label,
    short: def.short,
    icon: def.icon,
    missing: null,
    detail: <Summary />,
  };
});

export function ClockRail({
  active,
  width,
}: {
  readonly active: ClockSection;
  readonly width: RailWidth;
}): ReactNode {
  return (
    <SectionRail
      groups={[{ title: null, entries: ENTRIES }]}
      active={active}
      width={width}
      hrefOf={clockHrefOf}
    />
  );
}
