import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { href } from '../../app-shell/hrefs';
import type { IconName } from '../../components/icon';
import { Text } from '../../components/text';
import {
  ActionBand,
  WidgetFrame,
  widgetBodyHeight,
  type BoardClass,
  type WidgetSize,
} from '../../components/widget-board';
import { useWidgetFace } from '../../components/widget-board/use-widget-face';
import { useWidgetFrame } from '../../components/widget-board/widget-scope';
import { cn } from '../../design/cn';
import type { ColourRole } from '../../design/tokens';
import type { Device } from '../../store/state';
import { LogTally } from '../../design/log-tally';
import { pluginLog } from './plugin-log';
import type { PluginStream } from './use-plugin-stream';

const widgetTally = new LogTally(pluginLog, 'plugin_widget.summary', 10_000);

const BAND_GAP = 8;

const GAP_CLASS = { 4: 'gap-1', 8: 'gap-2' } as const;

export type FitGap = keyof typeof GAP_CLASS;
const MORE = 'more';

export const PLUGIN_WIDGET_SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['M', 'XL'],
  medium: ['M', 'XL'],
  expanded: ['M', 'W', 'XL'],
};

export function fittingCount(heights: readonly number[], gap: number, room: number): number {
  let used = -gap;
  let count = 0;
  for (const height of heights) {
    if (used + gap + height > room) {
      break;
    }
    used += gap + height;
    count += 1;
  }
  return count;
}

export function shownRows(
  heights: readonly number[],
  gap: number,
  room: number,
  more: { readonly height: number; readonly beyond: number } | null,
): number {
  const all = fittingCount(heights, gap, room);
  const reserve = more !== null && (more.beyond > 0 || all < heights.length);
  const fit = reserve ? fittingCount(heights, gap, room - gap - more.height) : all;
  return Math.max(Math.min(1, heights.length), fit);
}

export function bandCount(
  widths: readonly number[],
  gap: number,
  width: number,
  rows: number,
): number {
  let row = 0;
  let used = 0;
  let count = 0;
  for (const next of widths) {
    if (row > 0 && used + gap + next <= width) {
      used += gap + next;
    } else {
      if (row === rows || next > width) {
        break;
      }
      row += 1;
      used = next;
    }
    count += 1;
  }
  return count;
}

interface Part {
  readonly width: number;
  readonly size: number;
}

interface Measured {
  readonly width: number;
  readonly height: number;
  readonly parts: Readonly<Record<string, Part>>;
}

type PartLayout = (key: string, axis: 'width' | 'height') => (event: LayoutChangeEvent) => void;

function useMeasured(initial: number): {
  readonly measured: Measured;
  readonly onRoom: (event: LayoutChangeEvent) => void;
  readonly onPart: PartLayout;
} {
  const [measured, setMeasured] = useState<Measured>({ width: 0, height: initial, parts: {} });
  return {
    measured,
    onRoom: (event: LayoutChangeEvent): void => {
      const { width, height } = event.nativeEvent.layout;
      setMeasured((prev) =>
        prev.width === width && prev.height === height ? prev : { ...prev, width, height },
      );
    },
    onPart:
      (key: string, axis: 'width' | 'height') =>
      (event: LayoutChangeEvent): void => {
        const { width, height } = event.nativeEvent.layout;
        const size = axis === 'width' ? width : height;
        setMeasured((prev) => {
          const known = prev.parts[key];
          return known?.width === width && known.size === size
            ? prev
            : { ...prev, parts: { ...prev.parts, [key]: { width, size } } };
        });
      },
  };
}

export interface FitListProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly estimate: number;
  readonly gap: FitGap;
  readonly from?: 'start' | 'end';
  readonly beyond?: number;
  readonly more?: (hidden: number) => ReactNode;
  readonly children: (item: T, room: number | null) => ReactNode;
}

function FittedList<T>({
  items,
  keyOf,
  estimate,
  gap,
  from = 'start',
  beyond = 0,
  more,
  children,
  initial,
}: FitListProps<T> & { readonly initial: number }): ReactNode {
  const { measured, onRoom, onPart } = useMeasured(initial);
  const heightOf = (key: string): number => {
    const part = measured.parts[key];
    return part?.width === measured.width ? part.size : estimate;
  };
  const shown = shownRows(
    items.map((item) => heightOf(`row:${keyOf(item)}`)),
    gap,
    measured.height,
    more === undefined ? null : { height: heightOf(MORE), beyond },
  );
  const visible = items.slice(0, shown);
  const ordered = from === 'end' ? [...visible].reverse() : visible;
  const hidden = items.length - shown + beyond;
  return (
    <View
      className={cn(
        'min-h-0 flex-1 overflow-hidden',
        GAP_CLASS[gap],
        from === 'end' && 'justify-end',
      )}
      onLayout={onRoom}
    >
      {ordered.map((item) => (
        <View key={keyOf(item)} onLayout={onPart(`row:${keyOf(item)}`, 'height')}>
          {children(item, measured.height)}
        </View>
      ))}
      {hidden > 0 && more !== undefined ? (
        <View onLayout={onPart(MORE, 'height')}>{more(hidden)}</View>
      ) : null}
    </View>
  );
}

export function FitList<T>(props: FitListProps<T>): ReactNode {
  const frame = useWidgetFrame();
  if (frame !== null) {
    return <FittedList {...props} initial={widgetBodyHeight(frame)} />;
  }
  const { items, keyOf, gap, from = 'start', beyond = 0, more, children } = props;
  const ordered = from === 'end' ? [...items].reverse() : items;
  return (
    <View className={GAP_CLASS[gap]}>
      {ordered.map((item) => (
        <View key={keyOf(item)}>{children(item, null)}</View>
      ))}
      {beyond > 0 && more !== undefined ? more(beyond) : null}
    </View>
  );
}

export interface FitBandProps<T> {
  readonly items: readonly T[];
  readonly keyOf: (item: T) => string;
  readonly children: (item: T) => ReactNode;
}

function FittedBand<T>({
  items,
  keyOf,
  children,
  initial,
}: FitBandProps<T> & { readonly initial: number }): ReactNode {
  const { sizes } = useWidgetFace();
  const { measured, onRoom, onPart } = useMeasured(initial);
  const rows = Math.floor((measured.height + BAND_GAP) / (sizes.controlH + BAND_GAP));
  const widths = items.map((item) => measured.parts[keyOf(item)]?.size ?? 0);
  const shown = items.slice(0, bandCount(widths, BAND_GAP, measured.width, rows));
  return (
    <View className="min-h-0 flex-1 justify-end overflow-hidden" onLayout={onRoom}>
      <ActionBand>
        {shown.map((item) => (
          <View key={keyOf(item)} onLayout={onPart(keyOf(item), 'width')}>
            {children(item)}
          </View>
        ))}
      </ActionBand>
    </View>
  );
}

export function FitBand<T>(props: FitBandProps<T>): ReactNode {
  const frame = useWidgetFrame();
  if (frame !== null) {
    return <FittedBand {...props} initial={widgetBodyHeight(frame)} />;
  }
  const { items, keyOf, children } = props;
  return (
    <ActionBand>
      {items.map((item) => (
        <View key={keyOf(item)}>{children(item)}</View>
      ))}
    </ActionBand>
  );
}

interface PluginWidgetFrameProps<T> {
  readonly title: string;
  readonly icon: IconName;
  readonly accent: ColourRole;
  readonly size: WidgetSize;
  readonly device: Device | null;
  readonly stream: PluginStream<T>;
  readonly unavailable: (value: T) => string | null;
  readonly actions?: ReactNode;
  readonly children: (value: T) => ReactNode;
}

function Line({ text }: { readonly text: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={3}>
      {text}
    </Text>
  );
}

function Body<T>({
  stream,
  unavailable,
  children,
}: Pick<PluginWidgetFrameProps<T>, 'stream' | 'unavailable' | 'children'>): ReactNode {
  switch (stream.state) {
    case 'waiting':
      return <Line text="Waiting for the first reading…" />;
    case 'invalid':
      return <Line text="This widget could not read the latest data." />;
    case 'ready': {
      const reason = unavailable(stream.value);
      return reason === null ? children(stream.value) : <Line text={reason} />;
    }
  }
}

export function PluginWidgetFrame<T>({
  title,
  icon,
  accent,
  size,
  device,
  stream,
  unavailable,
  actions,
  children,
}: PluginWidgetFrameProps<T>): ReactNode {
  useEffect(() => {
    widgetTally.bump(`${title}:${size}:mounted`);
    return (): void => {
      widgetTally.bump(`${title}:${size}:unmounted`);
    };
  }, [title, size]);
  const link = device === null ? {} : { href: href.device(device) };
  return (
    <WidgetFrame title={title} icon={icon} accent={accent} actions={actions} {...link}>
      <Body stream={stream} unavailable={unavailable}>
        {children}
      </Body>
    </WidgetFrame>
  );
}
