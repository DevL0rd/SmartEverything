import type { ReactNode } from 'react';
import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { cn } from '../../design/cn';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { percent } from '../../format/number';
import { Text } from '../text';
import { useMeasuredWidth } from '../use-measured-width';
import { segmentShare } from './memory-bar';
import { markerLeft } from './progress-span';

export interface BarSegment {
  readonly label: string;
  readonly value: number;
  readonly colour: ColourRole;
}

export type SegmentBarSize = 'thin' | 'regular' | 'thick';

export interface SegmentBarProps {
  readonly segments: readonly BarSegment[];
  readonly label: string;
  readonly total?: number;
  readonly marker?: number | null;
  readonly size?: SegmentBarSize;
  readonly split?: boolean;
  readonly legend?: boolean;
  readonly format?: (value: number) => string;
}

const HEIGHT: Readonly<Record<SegmentBarSize, string>> = {
  thin: 'h-1',
  regular: 'h-2',
  thick: 'h-3',
};

const MARKER_CLASS = 'absolute top-0 rounded-full border-2 border-surface-1 bg-on-surface';

export function barTotal(segments: readonly BarSegment[], total: number | undefined): number {
  const sum = segments.reduce((all, segment) => all + Math.max(0, segment.value), 0);
  return Math.max(sum, total ?? 0);
}

export function barRemainder(segments: readonly BarSegment[], total: number | undefined): number {
  return barTotal(segments, total) - barTotal(segments, undefined);
}

export function segmentBarSummary(
  label: string,
  segments: readonly BarSegment[],
  total: number | undefined,
  format: ((value: number) => string) | undefined,
): string {
  const whole = barTotal(segments, total);
  if (format === undefined) {
    const parts = segments.map(
      (segment) => `${segment.label} ${percent(segmentShare(segment.value, whole))}`,
    );
    return `${label}: ${parts.join(', ')}`;
  }
  const parts = segments.map((segment) => `${segment.label} ${format(segment.value)}`);
  return `${label}: ${parts.join(', ')} of ${format(whole)}`;
}

export function BarMarker({
  share,
  width,
  size,
}: {
  readonly share: number;
  readonly width: number;
  readonly size: 'size-3' | 'size-4';
}): ReactNode {
  const left = { left: markerLeft(width, share, size === 'size-3' ? 12 : 16) };
  return <View style={left} className={cn(MARKER_CLASS, size)} />;
}

function Piece({
  value,
  whole,
  colour,
  split,
}: {
  readonly value: number;
  readonly whole: number;
  readonly colour: ColourRole;
  readonly split: boolean;
}): ReactNode {
  const paint: ViewStyle = {
    flexGrow: segmentShare(value, whole),
    flexBasis: 0,
    backgroundColor: useColour(colour),
  };
  return <View style={paint} className={split ? 'h-full rounded-full' : 'h-full'} />;
}

function Rest({ value, whole }: { readonly value: number; readonly whole: number }): ReactNode {
  const size: ViewStyle = { flexGrow: segmentShare(value, whole), flexBasis: 0 };
  return <View style={size} />;
}

function Track({
  segments,
  total,
  size,
  split,
}: {
  readonly segments: readonly BarSegment[];
  readonly total: number | undefined;
  readonly size: SegmentBarSize;
  readonly split: boolean;
}): ReactNode {
  const whole = barTotal(segments, total);
  const rest = barRemainder(segments, total);
  return (
    <View
      className={cn(
        'w-full flex-row',
        HEIGHT[size],
        split ? 'gap-1' : 'gap-0.5 overflow-hidden rounded-full bg-surface-3',
      )}
    >
      {segments.map((segment, index) =>
        segment.value > 0 ? (
          <Piece
            key={`${segment.label}-${String(index)}`}
            value={segment.value}
            whole={whole}
            colour={segment.colour}
            split={split}
          />
        ) : null,
      )}
      {split && rest > 0 ? <Piece value={rest} whole={whole} colour="surface-3" split /> : null}
      {!split && rest > 0 ? <Rest value={rest} whole={whole} /> : null}
    </View>
  );
}

function LegendDot({ colour }: { readonly colour: ColourRole }): ReactNode {
  const paint = { backgroundColor: useColour(colour) };
  return <View style={paint} className="size-2 rounded-full" />;
}

function Legend({
  segments,
  format,
}: {
  readonly segments: readonly BarSegment[];
  readonly format: ((value: number) => string) | undefined;
}): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {segments.map((segment, index) => (
        <View key={`${segment.label}-${String(index)}`} className="flex-row items-center gap-1.5">
          <LegendDot colour={segment.colour} />
          <Text variant="footnote" tone="variant">
            {segment.label}
          </Text>
          {format === undefined ? null : (
            <Text variant="footnote" className="tabular">
              {format(segment.value)}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export const SegmentBar = memo(function SegmentBar({
  segments,
  label,
  total,
  marker = null,
  size = 'regular',
  split = false,
  legend = false,
  format,
}: SegmentBarProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View className="w-full gap-2">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={segmentBarSummary(label, segments, total, format)}
        className={cn('w-full justify-center', marker !== null && 'h-4')}
        onLayout={onLayout}
      >
        <Track segments={segments} total={total} size={size} split={split} />
        {marker === null ? null : <BarMarker share={marker} width={width} size="size-4" />}
      </View>
      {legend ? <Legend segments={segments} format={format} /> : null}
    </View>
  );
});
