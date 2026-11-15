import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { PhotoPlace } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { MAP_COPY } from './map-copy';
import { AllTimeButton, MonthRangeChart, type MonthRangeProps } from './month-range';
import { inViewLine } from './place-model';
import { PlaceRowItem } from './places-list';
import { isFull, rangeLabel } from './time-range';

export interface PhonePlacesPanelProps {
  readonly places: readonly PhotoPlace[];
  readonly total: number;
  readonly searching: boolean;
  readonly range: MonthRangeProps;
  readonly attribution: string;
}

function TimeRange({ range }: { readonly range: MonthRangeProps }): ReactNode {
  if (range.months.length === 0) return null;
  const label = rangeLabel(range.range, range.months);
  return (
    <View className="gap-1 border-b-hairline border-outline-variant pb-3">
      <View className="min-h-11 flex-row items-center gap-2">
        <View className="min-w-0 flex-1">
          <Text variant="label">Time range</Text>
          {label === null ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
              {label}
            </Text>
          )}
        </View>
        {isFull(range.range, range.months) ? null : <AllTimeButton {...range} />}
      </View>
      <MonthRangeChart {...range} />
    </View>
  );
}

function PlaceList({
  places,
  searching,
}: {
  readonly places: readonly PhotoPlace[];
  readonly searching: boolean;
}): ReactNode {
  if (places.length === 0) {
    return (
      <Text variant="footnote" tone="variant" className="px-2.5 py-2">
        {searching ? MAP_COPY.noMatch : MAP_COPY.noneInView}
      </Text>
    );
  }
  return places.map((place) => <PlaceRowItem key={place.id} place={place} share={null} />);
}

function PanelHead({
  title,
  open,
  narrowed,
  line,
  onToggle,
}: {
  readonly title: string;
  readonly open: boolean;
  readonly narrowed: string | null;
  readonly line: string;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Interactive
      label={open ? `Show less of ${title.toLowerCase()}` : `Show ${title.toLowerCase()}`}
      expanded={open}
      onPress={onToggle}
      className="items-center gap-1 pt-2"
      layerClassName="rounded-lg"
    >
      <View className="h-1 w-9 rounded-full bg-outline-variant" />
      <View className="w-full flex-row items-baseline justify-between gap-2 py-1">
        <View className="min-w-0 flex-1">
          <Text variant="title-3" numberOfLines={1}>
            {title}
          </Text>
          {narrowed === null || open ? null : (
            <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
              {narrowed}
            </Text>
          )}
        </View>
        <Text variant="footnote" tone="variant" className="tabular-nums">
          {line}
        </Text>
      </View>
    </Interactive>
  );
}

export function PhonePlacesPanel({
  places,
  total,
  searching,
  range,
  attribution,
}: PhonePlacesPanelProps): ReactNode {
  const [open, setOpen] = useState(false);
  const title = searching ? MAP_COPY.found : MAP_COPY.inView;
  const narrowed = isFull(range.range, range.months) ? null : rangeLabel(range.range, range.months);
  return (
    <View
      className={cn(
        'absolute inset-x-3 bottom-3 rounded-xl border-hairline border-outline-variant bg-surface-raised px-4 pb-3',
        open && 'top-1/4',
      )}
    >
      <View pointerEvents="none" className="absolute -top-6 left-0">
        <Text variant="caption" tone="variant">
          {attribution}
        </Text>
      </View>
      <PanelHead
        title={title}
        open={open}
        narrowed={narrowed}
        line={inViewLine(places.length, total)}
        onToggle={() => {
          setOpen(!open);
        }}
      />
      {open ? (
        <ScrollView className="-mx-2.5 flex-1">
          <View className="px-2.5 pb-1">
            <TimeRange range={range} />
          </View>
          <PlaceList places={places} searching={searching} />
        </ScrollView>
      ) : null}
    </View>
  );
}
