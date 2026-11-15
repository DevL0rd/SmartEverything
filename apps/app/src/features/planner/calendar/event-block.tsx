import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { cn } from '../../../design/cn';
import { percentOf } from '../../../format/percent';
import { HOUR_MS, shiftDay, startOfDayKey, weekdayShort } from '../../../format/time';
import { useItemPress } from '../item/item-menu-host';
import type { EventLook } from './calendars-model';
import { Hatch, LookMark, eventFill, lookWords } from './event-look';
import { draftTimeOf } from './drag-create';
import { MovableBlock, type BlockDragContext, type BlockShift } from './grid-gestures';
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

const MARKS_FROM = 72;

const TITLE_FROM = 28;

const TIME_FROM = 44;

export type TextMode = 'bare' | 'title' | 'full';

export function blockTextOf(laneWidth: number): TextMode {
  if (laneWidth < TITLE_FROM) return 'bare';
  return laneWidth < TIME_FROM ? 'title' : 'full';
}

export function laneWidthOf(block: GridBlock, columnWidth: number): number {
  return (columnWidth * block.width) / block.lanes;
}

function Marks({
  look,
  readOnly,
  width,
}: {
  readonly look: EventLook;
  readonly readOnly: boolean;
  readonly width: number;
}): ReactNode {
  if (width < MARKS_FROM) return null;
  return (
    <View className="shrink-0 flex-row items-center gap-0.5">
      <LookMark look={look} />
      <Lock shown={readOnly} />
    </View>
  );
}

export interface LanePlace {
  readonly left: `${number}%`;
  readonly width: `${number}%`;
}

export function laneOf(block: GridBlock): LanePlace {
  return { left: percentOf(block.lane / block.lanes), width: percentOf(block.width / block.lanes) };
}

export function blockBandOf(
  block: GridBlock,
  hourHeight: number,
  minHeight: number,
): { readonly top: number; readonly bottom: number } {
  const top = yOf(block.from, hourHeight);
  return { top, bottom: top + Math.max(minHeight, yOf(block.to, hourHeight) - top) };
}

export function movedTimeOf(block: GridBlock, shift: BlockShift, date: string): string {
  const time = draftTimeOf({ from: block.from + shift.start, to: block.to + shift.end });
  if (shift.days === 0) return time;
  return `${weekdayShort(startOfDayKey(shiftDay(date, shift.days)) + 12 * HOUR_MS)} ${time}`;
}

function BlockText({
  block,
  mode,
  width,
  tall,
  subtitle,
}: {
  readonly block: GridBlock;
  readonly mode: TextMode;
  readonly width: number;
  readonly tall: boolean;
  readonly subtitle: string;
}): ReactNode {
  if (mode === 'bare') return <Hatch shown={block.look === 'maybe'} />;
  return (
    <>
      <Hatch shown={block.look === 'maybe'} />
      <View className="flex-row items-start gap-1">
        <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
          {block.occurrence.title}
        </Text>
        <Marks look={block.look} readOnly={block.readOnly} width={width} />
      </View>
      {mode === 'full' && tall && subtitle !== '' ? (
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {subtitle}
        </Text>
      ) : null}
    </>
  );
}

const INNER_PAD: Readonly<Record<TextMode, string>> = {
  bare: 'p-0',
  title: 'px-1 py-1',
  full: 'px-1.5 py-1',
};

function innerPadOf(mode: TextMode, compact: boolean): string {
  return mode === 'full' && !compact ? 'px-2 py-1' : INNER_PAD[mode];
}

function subtitleOf(block: GridBlock, shift: BlockShift | null, date: string): string {
  if (shift !== null) return movedTimeOf(block, shift, date);
  return block.proposed ? 'Proposed' : block.time;
}

interface Moving {
  readonly shift: BlockShift;
  readonly from: number;
  readonly to: number;
}

function useMoving(block: GridBlock): {
  readonly shift: BlockShift | null;
  readonly onShift: (shift: BlockShift | null) => void;
} {
  const [moving, setMoving] = useState<Moving | null>(null);
  const current = moving !== null && moving.from === block.from && moving.to === block.to;
  return {
    shift: current ? moving.shift : null,
    onShift: (shift): void => {
      setMoving(shift === null ? null : { shift, from: block.from, to: block.to });
    },
  };
}

export function EventBlock({
  block,
  context,
  hourHeight,
  inset,
}: {
  readonly block: GridBlock;
  readonly context: BlockDragContext;
  readonly hourHeight: number;
  readonly inset: number;
}): ReactNode {
  const title = block.occurrence.title;
  const height = blockBandOf(block, hourHeight, context.minHeight);
  const press = useItemPress(block.occurrence.item_id, block.occurrence.occurrence_key);
  const moving = useMoving(block);
  const compact = context.touch;
  const width = laneWidthOf(block, context.columnWidth) - inset;
  const mode = blockTextOf(width);
  return (
    <MovableBlock
      block={block}
      context={context}
      lane={laneOf(block)}
      onShift={moving.onShift}
      className={cn('pb-px', compact || mode !== 'full' ? 'px-0.5' : 'px-1')}
    >
      <View style={insetStyle(inset)} className="flex-1 rounded-sm bg-surface-1">
        <Interactive
          {...press.open}
          onContextMenu={press.onContextMenu}
          label={eventLabel(block, title)}
          className={cn(
            'flex-1 overflow-hidden rounded-sm',
            innerPadOf(mode, compact),
            eventFill(block.colour, block.proposed, block.look),
          )}
        >
          <BlockText
            block={block}
            mode={mode}
            width={width}
            tall={height.bottom - height.top >= SUBTITLE_FROM}
            subtitle={subtitleOf(block, moving.shift, context.date)}
          />
          {press.menu}
        </Interactive>
      </View>
    </MovableBlock>
  );
}

function insetStyle(inset: number): { readonly marginLeft: number } {
  return { marginLeft: inset };
}

export function AllDayChip({ entry }: { readonly entry: AllDayEntry }): ReactNode {
  const title = entry.occurrence.title;
  const press = useItemPress(entry.occurrence.item_id, entry.occurrence.occurrence_key);
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View onLayout={onLayout}>
      <Interactive
        {...press.open}
        onLongPress={press.onLongPress}
        onContextMenu={press.onContextMenu}
        label={eventLabel(
          { time: 'all day', proposed: false, readOnly: entry.readOnly, look: entry.look },
          title,
        )}
        className={cn(
          'flex-row items-center gap-1 overflow-hidden rounded-xs py-0.5',
          width < TIME_FROM ? 'px-1' : 'px-1.5',
          eventFill(entry.colour, entry.occurrence.status === 'proposed', entry.look),
        )}
      >
        <Hatch shown={entry.look === 'maybe'} />
        <Text variant="caption" numberOfLines={1} className="min-w-0 flex-1">
          {title}
        </Text>
        <Marks look={entry.look} readOnly={entry.readOnly} width={width} />
        {press.menu}
      </Interactive>
    </View>
  );
}
