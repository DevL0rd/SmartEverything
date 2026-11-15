import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { percentOf } from '../../../format/percent';
import { useItemPress } from '../item/item-menu-host';
import type { EventLook } from './calendars-model';
import { Hatch, LookMark, eventFill, lookWords } from './event-look';
import { yOf, type AllDayEntry, type GridBlock } from './time-grid-layout';

const SUBTITLE_FROM = 36;

export function eventLabel(
  entry: {
    readonly time: string;
    readonly proposed: boolean;
    readonly readOnly: boolean;
    readonly look: EventLook;
  },
  title: string,
): string {
  const parts = [
    title,
    entry.time,
    ...(entry.proposed ? ['proposed, not booked'] : []),
    ...lookWords(entry.look),
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
    left: percentOf(block.lane / block.lanes),
    width: percentOf(block.width / block.lanes),
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
  const press = useItemPress(block.occurrence.item_id, block.occurrence.occurrence_key);
  return (
    <View style={place} className={cn('absolute pb-px', compact ? 'px-0.5' : 'px-1')}>
      <View className="flex-1 rounded-sm bg-surface-1">
        <Interactive
          {...press.open}
          onContextMenu={press.onContextMenu}
          label={eventLabel(block, title)}
          className={cn(
            'flex-1 overflow-hidden rounded-sm',
            compact ? 'px-1.5 py-1' : 'px-2 py-1',
            eventFill(block.colour, block.proposed, block.look),
          )}
        >
          <Hatch shown={block.look === 'maybe'} />
          <View className="flex-row items-start gap-1">
            <LookMark look={block.look} />
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
          {press.menu}
        </Interactive>
      </View>
    </View>
  );
}

export function AllDayChip({ entry }: { readonly entry: AllDayEntry }): ReactNode {
  const title = entry.occurrence.title;
  const press = useItemPress(entry.occurrence.item_id, entry.occurrence.occurrence_key);
  return (
    <Interactive
      {...press.open}
      onLongPress={press.onLongPress}
      onContextMenu={press.onContextMenu}
      label={eventLabel(
        { time: 'all day', proposed: false, readOnly: entry.readOnly, look: entry.look },
        title,
      )}
      className={cn(
        'flex-row items-center gap-1 overflow-hidden rounded-xs px-1.5 py-0.5',
        eventFill(entry.colour, entry.occurrence.status === 'proposed', entry.look),
      )}
    >
      <Hatch shown={entry.look === 'maybe'} />
      <LookMark look={entry.look} />
      <Text variant="caption" numberOfLines={1} className="flex-1">
        {title}
      </Text>
      <Lock shown={entry.readOnly} />
      {press.menu}
    </Interactive>
  );
}
