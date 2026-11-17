import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import { useInstantClock } from '../format/clock-format';
import { useSecondOf } from '../../../store/clock';

const SECOND_MS = 1000;

const MINUTE_S = 60;

export function snoozeLeftOf(untilMs: number, now: number): number {
  return Math.max(0, Math.ceil((untilMs - now) / SECOND_MS));
}

export function snoozeLeftText(seconds: number): string {
  const minutes = Math.floor(seconds / MINUTE_S);
  return `${String(minutes)}:${String(seconds % MINUTE_S).padStart(2, '0')}`;
}

function flexStyle(grow: number): { readonly flexGrow: number } {
  return { flexGrow: grow };
}

export function SnoozeMeter({
  until,
  minutes,
}: {
  readonly until: string;
  readonly minutes: number | null;
}): ReactNode {
  const untilMs = Date.parse(until);
  const left = useSecondOf((now) => snoozeLeftOf(untilMs, now));
  const at = useInstantClock()(until);
  const total = minutes === null ? null : minutes * MINUTE_S;
  const share = total === null || total === 0 ? null : Math.min(1, left / total);
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`Snoozed, rings again at ${at}, in ${snoozeLeftText(left)}`}
      className="gap-2 rounded-lg bg-surface-1/80 px-4 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Icon name="moon" size={18} tone="primary" />
        <Text variant="callout" className="min-w-0 flex-1" numberOfLines={1}>
          {`Snoozed · rings again at ${at}`}
        </Text>
        <Text variant="body-strong" className="tabular">
          {snoozeLeftText(left)}
        </Text>
      </View>
      {share === null ? null : (
        <View className="h-1.5 flex-row overflow-hidden rounded-full bg-primary/15">
          <View className="basis-0 rounded-full bg-primary" style={flexStyle(share)} />
          <View className="basis-0" style={flexStyle(1 - share)} />
        </View>
      )}
    </View>
  );
}
