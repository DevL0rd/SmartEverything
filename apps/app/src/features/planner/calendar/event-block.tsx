import type { PlannerColourKey } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { yOf, type AllDayEntry, type GridBlock } from './time-grid-layout';

const EVENT_TINT: Readonly<Record<PlannerColourKey, string>> = {
  work: 'bg-viz-6/18',
  family: 'bg-viz-1/18',
  personal: 'bg-viz-3/20',
  health: 'bg-positive/18',
  home: 'bg-viz-4/18',
  shopping: 'bg-viz-5/18',
};

const SUBTITLE_FROM = 36;

export function eventFill(colour: PlannerColourKey | null, proposed: boolean): string {
  if (proposed) return 'border border-dashed border-primary bg-transparent';
  return colour === null ? 'bg-surface-3' : EVENT_TINT[colour];
}

export function eventLabel(
  entry: { readonly time: string; readonly proposed: boolean; readonly readOnly: boolean },
  title: string,
): string {
  const parts = [
    title,
    entry.time,
    ...(entry.proposed ? ['proposed, not booked'] : []),
    ...(entry.readOnly ? ['read only'] : []),
  ];
  return parts.filter((part) => part !== '').join(', ');
}

function Lock({ shown }: { readonly shown: boolean }): ReactNode {
  return shown ? <Icon name="lock" size={16} tone="variant" /> : null;
}

interface Place {
  readonly top: number;
  readonly height: number;
  readonly left: `${number}%`;
  readonly width: `${number}%`;
}

function placeOf(block: GridBlock, hourHeight: number, minHeight: number): Place {
  const top = yOf(block.from, hourHeight);
  const height = Math.max(minHeight, yOf(block.to, hourHeight) - top);
  return {
    top,
    height,
    left: `${(block.lane / block.lanes) * 100}%`,
    width: `${(block.width / block.lanes) * 100}%`,
  };
}

export function EventBlock({
  block,
  hourHeight,
  minHeight,
  compact,
}: {
  readonly block: GridBlock;
  readonly hourHeight: number;
  readonly minHeight: number;
  readonly compact: boolean;
}): ReactNode {
  const place = placeOf(block, hourHeight, minHeight);
  const title = block.occurrence.title;
  const subtitle = block.proposed ? 'Proposed' : block.time;
  return (
    <View style={place} className={cn('absolute pb-px', compact ? 'px-0.5' : 'px-1')}>
      <View className="flex-1 rounded-sm bg-surface-1">
        <Interactive
          href={href.planner.item(block.occurrence.item_id)}
          label={eventLabel(block, title)}
          className={cn(
            'flex-1 overflow-hidden rounded-sm',
            compact ? 'px-1.5 py-1' : 'px-2 py-1',
            eventFill(block.colour, block.proposed),
          )}
        >
          <View className="flex-row items-start gap-1">
            <Text variant="caption" numberOfLines={1} className="flex-1">
              {title}
            </Text>
            <Lock shown={block.readOnly} />
          </View>
          {place.height >= SUBTITLE_FROM && subtitle !== '' ? (
            <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
              {subtitle}
            </Text>
          ) : null}
        </Interactive>
      </View>
    </View>
  );
}

export function AllDayChip({ entry }: { readonly entry: AllDayEntry }): ReactNode {
  const title = entry.occurrence.title;
  return (
    <Interactive
      href={href.planner.item(entry.occurrence.item_id)}
      label={eventLabel({ time: 'all day', proposed: false, readOnly: entry.readOnly }, title)}
      className={cn(
        'flex-row items-center gap-1 rounded-xs px-1.5 py-0.5',
        eventFill(entry.colour, entry.occurrence.status === 'proposed'),
      )}
    >
      <Text variant="caption" numberOfLines={1} className="flex-1">
        {title}
      </Text>
      <Lock shown={entry.readOnly} />
    </Interactive>
  );
}
