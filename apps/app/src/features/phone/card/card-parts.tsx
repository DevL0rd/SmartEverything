import { memo, type ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { Icon } from '../../../components/icon';
import { FigureText } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { cn } from '../../../design/cn';
import { hoursMinutes } from '../../../format/time';
import { isLow, type FaceReadings, type FaceTone, type FaceWord } from '../model/face-model';

const NETWORK_TEXT: Readonly<Record<NonNullable<FaceReadings['networkKind']>, string>> = {
  wifi: 'Wi-Fi',
  cellular: 'Mobile data',
  ethernet: 'Ethernet',
  other: 'Connected',
  offline: 'Offline',
};

const BARS = ['h-1.5', 'h-2', 'h-3', 'h-4'] as const;

const WORD_TONE: Readonly<Record<FaceTone, Tone>> = {
  positive: 'positive',
  info: 'default',
  warning: 'warning',
  critical: 'critical',
  neutral: 'variant',
};

export function BatteryFigure({
  readings,
  size,
  stale,
}: {
  readonly readings: FaceReadings;
  readonly size: 's' | 'm' | 'l';
  readonly stale: boolean;
}): ReactNode {
  if (readings.battery === null) {
    return (
      <Text variant="callout" tone="variant">
        Battery not reported
      </Text>
    );
  }
  return (
    <View className="flex-row items-center gap-1.5" pointerEvents="none">
      <FigureText
        text={String(readings.battery)}
        unit="%"
        size={size}
        tone={isLow(readings) ? 'warning' : 'default'}
        stale={stale}
      />
      {readings.charging && !stale ? (
        <Icon name="batteryCharging" size={20} tone="positive" />
      ) : null}
    </View>
  );
}

export function SignalMeter({
  bars,
  stale,
}: {
  readonly bars: number | null;
  readonly stale: boolean;
}): ReactNode {
  const lit = stale ? 0 : (bars ?? 0);
  return (
    <View aria-hidden className="h-5 shrink-0 flex-row items-end gap-0.5">
      {BARS.map((height, index) => (
        <View
          key={height}
          className={cn('w-1 rounded-full', height, index < lit ? 'bg-on-surface' : 'bg-outline')}
        />
      ))}
    </View>
  );
}

export const SignalStat = memo(function SignalStat({
  kind,
  bars,
  stale,
  large,
}: {
  readonly kind: FaceReadings['networkKind'];
  readonly bars: number | null;
  readonly stale: boolean;
  readonly large: boolean;
}): ReactNode {
  const text = stale || kind === null ? '—' : NETWORK_TEXT[kind];
  return (
    <View
      accessible
      accessibilityLabel={`Signal ${String(bars ?? 0)} of 4, ${text}`}
      className="shrink-0 flex-row items-center gap-1.5"
      pointerEvents="none"
    >
      <SignalMeter bars={bars} stale={stale} />
      <Text variant={large ? 'callout' : 'caption'} tone="variant" numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
});

export function WordLine({
  word,
  detail,
}: {
  readonly word: FaceWord;
  readonly detail: boolean;
}): ReactNode {
  const text = detail && word.detail !== null ? `${word.word} · ${word.detail}` : word.word;
  return (
    <Text variant="caption" tone={WORD_TONE[word.tone]} numberOfLines={1} className="shrink">
      {text}
    </Text>
  );
}

export function ScreenTimeStat({
  minutes,
  stale,
}: {
  readonly minutes: number | null;
  readonly stale: boolean;
}): ReactNode {
  if (minutes === null) return null;
  return (
    <View className="shrink-0" pointerEvents="none">
      <Text variant="caption" tone="variant">
        Screen time
      </Text>
      <FigureText
        text={hoursMinutes(minutes)}
        unit={undefined}
        size="s"
        tone="default"
        stale={stale}
      />
    </View>
  );
}

export const PlayingLine = memo(function PlayingLine({
  title,
}: {
  readonly title: string | null;
}): ReactNode {
  if (title === null) return null;
  return (
    <View className="min-w-0 flex-1 flex-row items-center gap-1" pointerEvents="none">
      <Icon name="music" size={16} tone="variant" />
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink">
        {title}
      </Text>
    </View>
  );
});

const MIN_BAR = 3;

function barStyle(height: number, most: number, share: number): ViewStyle {
  return { height: Math.max(MIN_BAR, (height * share) / most) };
}

export function MiniBars({
  values,
  height,
}: {
  readonly values: readonly number[];
  readonly height: number;
}): ReactNode {
  const most = Math.max(1, ...values);
  const frame: ViewStyle = { height };
  return (
    <View aria-hidden style={frame} className="flex-row items-end gap-0.5">
      {values.map((value, index) => (
        <View
          key={String(index)}
          style={barStyle(height, most, value)}
          className={cn(
            'min-w-0 flex-1 rounded-xs',
            index === values.length - 1 ? 'bg-viz-1' : 'bg-viz-1/50',
          )}
        />
      ))}
    </View>
  );
}
