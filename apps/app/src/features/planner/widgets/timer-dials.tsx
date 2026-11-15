import type { PlannerTimerRow } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { duration } from '../../../format/time';
import { TimerDial, type TimerView } from '../../clock';

const SECOND_MS = 1000;

function lengthOf(timer: PlannerTimerRow): string {
  return duration(Math.round(timer.duration_ms / SECOND_MS));
}

export function timerTitleOf(timer: PlannerTimerRow): string {
  return timer.label ?? `${lengthOf(timer)} timer`;
}

function dialNameOf(timer: PlannerTimerRow): string {
  return timer.label ?? lengthOf(timer);
}

export function TimerDials({
  views,
  count,
}: {
  readonly views: readonly TimerView[];
  readonly count: number;
}): ReactNode {
  const over = views.length > count;
  const shown = over ? Math.max(0, count - 1) : count;
  const rest = views.length - shown;
  return (
    <View className="min-w-0 flex-1 flex-row flex-wrap content-start gap-3">
      {views.slice(0, shown).map((view) => (
        <View key={view.timer.id} className="w-18 items-center gap-0.5">
          <TimerDial view={view} size="row" />
          <Text variant="caption" tone="variant" numberOfLines={1}>
            {dialNameOf(view.timer)}
          </Text>
        </View>
      ))}
      {over && count > 0 ? (
        <View
          accessible
          accessibilityLabel={`${String(rest)} more timers`}
          className="w-18 items-center gap-0.5"
        >
          <View className="size-18 items-center justify-center rounded-full bg-surface-3">
            <Text variant="body-strong" tone="variant" className="tabular-nums">
              {`+${String(rest)}`}
            </Text>
          </View>
          <Text variant="caption" tone="variant" numberOfLines={1}>
            More
          </Text>
        </View>
      ) : null}
    </View>
  );
}
