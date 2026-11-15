import type { PlannerColourKey } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { percentOf } from '../../../format/percent';
import { useRows } from '../../../store/selectors';
import { eventFill } from './event-look';
import type { MinuteSpan } from './grid-gestures';
import type { GridSpan } from './time-grid-layout';

const EDGE_INSET = 3;

function share(minutes: number, window: MinuteSpan): `${number}%` {
  return percentOf(minutes / (window.to - window.from));
}

export function barOf(
  span: MinuteSpan,
  window: MinuteSpan,
): { readonly left: `${number}%`; readonly width: `${number}%` } | null {
  const from = Math.max(span.from, window.from);
  const to = Math.min(span.to, window.to);
  if (to <= from) return null;
  return { left: share(from - window.from, window), width: share(to - from, window) };
}

export function hourMarksOf(window: MinuteSpan): readonly number[] {
  const first = window.from / 60;
  return Array.from({ length: (window.to - window.from) / 60 }, (_, index) => first + index);
}

function useColours(): (collectionId: string) => PlannerColourKey | null {
  const collections = useRows('planner_collections');
  return (collectionId) =>
    collections.find((collection) => collection.id === collectionId)?.colour ?? null;
}

type Place = NonNullable<ReturnType<typeof barOf>>;

type BarStyle = Place | { readonly left: Place['left']; readonly right: number };

export function barStyleOf(place: Place, span: MinuteSpan, window: MinuteSpan): BarStyle {
  return span.to >= window.to ? { left: place.left, right: EDGE_INSET } : place;
}

function Bar({
  place,
  title,
  fill,
}: {
  readonly place: BarStyle;
  readonly title: string;
  readonly fill: string | null;
}): ReactNode {
  return (
    <View
      style={place}
      className={cn(
        'absolute bottom-1.5 top-1.5 justify-center overflow-hidden rounded-sm px-1.5',
        fill ?? 'border border-outline bg-surface-2',
      )}
    >
      <Text variant="caption" tone={fill === null ? 'variant' : 'default'} numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

export function Bars({
  spans,
  window,
}: {
  readonly spans: readonly GridSpan[];
  readonly window: MinuteSpan;
}): ReactNode {
  const colourOf = useColours();
  return spans.map((span) => {
    const place = barOf(span, window);
    const fill = eventFill(colourOf(span.occurrence.collection_id), false, 'plain');
    return place === null ? null : (
      <Bar
        key={span.key}
        place={barStyleOf(place, span, window)}
        title={span.occurrence.title}
        fill={fill}
      />
    );
  });
}

export function FreeBars({
  gaps,
  window,
}: {
  readonly gaps: readonly MinuteSpan[];
  readonly window: MinuteSpan;
}): ReactNode {
  return gaps.map((gap) => {
    const place = barOf(gap, window);
    return place === null ? null : (
      <Bar
        key={`${String(gap.from)}-${String(gap.to)}`}
        place={barStyleOf(place, gap, window)}
        title="Free"
        fill={null}
      />
    );
  });
}

export function TrackLines({ window }: { readonly window: MinuteSpan }): ReactNode {
  return (
    <View aria-hidden pointerEvents="none" className="absolute inset-0 flex-row">
      {hourMarksOf(window).map((hour) => (
        <View key={hour} className="flex-1 border-l border-outline-variant" />
      ))}
    </View>
  );
}
