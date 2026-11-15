import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { AllDayChip } from './event-block';
import { topStyle, yOf, type GridDay } from './time-grid-layout';

export interface Geometry {
  readonly compact: boolean;
  readonly hourHeight: number;
}

const LABEL_HALF = 8;

const LETTER_FROM = 4;

interface HourLabel {
  readonly hour: number;
  readonly label: string;
}

export function hourLabelsOf(compact: boolean): readonly HourLabel[] {
  return Array.from({ length: 23 }, (_, index) => {
    const hour = index + 1;
    const label = String(hour).padStart(2, '0');
    return { hour, label: compact ? label : `${label}:00` };
  });
}

const GUTTER = { compact: 'w-10', wide: 'w-13' } as const;

export function gutterOf(compact: boolean): string {
  return compact ? GUTTER.compact : GUTTER.wide;
}

export interface HeadShape {
  readonly compact: boolean;
  readonly columns: number;
  readonly allDay: boolean;
}

function DayName({ day, shape }: { readonly day: GridDay; readonly shape: HeadShape }): ReactNode {
  const tone = day.today ? 'primary' : 'default';
  if (shape.compact) {
    return (
      <View className="items-center">
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {shape.columns >= LETTER_FROM ? day.letter : day.weekday}
        </Text>
        <Text variant="title-3" tone={tone} className="tabular">
          {day.number}
        </Text>
      </View>
    );
  }
  return (
    <View>
      <Text variant="caption" tone="variant">
        {day.weekday}
      </Text>
      <Text variant="title-2" tone={tone} className="tabular">
        {day.number}
      </Text>
    </View>
  );
}

function AllDayRow({ day }: { readonly day: GridDay }): ReactNode {
  return (
    <View className="min-h-5 gap-1">
      {day.allDay.map((entry) => (
        <AllDayChip key={entry.key} entry={entry} />
      ))}
    </View>
  );
}

function DayHead({ day, shape }: { readonly day: GridDay; readonly shape: HeadShape }): ReactNode {
  const single = shape.columns === 1;
  return (
    <View
      className={cn(
        'min-w-0 flex-1 gap-1 border-l border-outline-variant',
        shape.compact ? 'px-1 py-1.5' : 'px-2.5 pb-2 pt-2.5',
        single && 'px-2 py-1.5',
      )}
    >
      {single ? null : <DayName day={day} shape={shape} />}
      {shape.allDay ? <AllDayRow day={day} /> : null}
    </View>
  );
}

export function DayHeads({
  days,
  shape,
}: {
  readonly days: readonly GridDay[];
  readonly shape: HeadShape;
}): ReactNode {
  if (shape.columns === 1 && !shape.allDay) return null;
  return (
    <View className="flex-row border-b border-outline-variant">
      <View className={gutterOf(shape.compact)} />
      {days.map((day) => (
        <DayHead key={day.date} day={day} shape={shape} />
      ))}
    </View>
  );
}

export function HourColumn({ geometry }: { readonly geometry: Geometry }): ReactNode {
  return (
    <View aria-hidden className={cn('relative', gutterOf(geometry.compact))}>
      {hourLabelsOf(geometry.compact).map((hour) => (
        <View
          key={hour.hour}
          style={topStyle(yOf(hour.hour * 60, geometry.hourHeight) - LABEL_HALF)}
          className="absolute inset-x-0 h-4 items-end pr-1.5"
        >
          <Text variant="caption" tone="faint" className="font-mono tabular">
            {hour.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function HourLines({ hourHeight }: { readonly hourHeight: number }): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="absolute inset-0">
      {hourLabelsOf(true).map((hour) => (
        <View
          key={hour.hour}
          style={topStyle(yOf(hour.hour * 60, hourHeight))}
          className="absolute inset-x-0 h-hairline bg-outline-variant"
        />
      ))}
    </View>
  );
}
