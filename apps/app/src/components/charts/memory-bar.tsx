import type { ReactNode } from 'react';
import { memo } from 'react';
import { View, type ViewStyle } from 'react-native';
import { decimal } from '../../format/number';
import { Text } from '../text';
import { Swatch } from './chart-legend';

type MemoryColour = 'viz-blue' | 'viz-magenta' | 'viz-violet';

const FILL: Readonly<Record<MemoryColour, string>> = {
  'viz-blue': 'bg-viz-blue',
  'viz-magenta': 'bg-viz-magenta',
  'viz-violet': 'bg-viz-violet',
};

export interface MemorySegment {
  readonly label: string;
  readonly value: number;
  readonly colour?: MemoryColour;
}

export interface MemoryBarProps {
  readonly total: number;
  readonly segments: readonly MemorySegment[];
  readonly unit?: string;
  readonly showTotal?: boolean;
}

const oneDecimal = (value: number): string => decimal(value, 1);

export function memorySummary(
  total: number,
  segments: readonly MemorySegment[],
  unit: string,
): string {
  const parts = segments.map((segment) => `${segment.label} ${oneDecimal(segment.value)} ${unit}`);
  return `${parts.join(', ')} of ${String(total)} ${unit}`;
}

export function segmentShare(value: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, value / total)) : 0;
}

function Piece({
  segment,
  total,
}: {
  readonly segment: MemorySegment;
  readonly total: number;
}): ReactNode {
  const size: ViewStyle = { flexGrow: segmentShare(segment.value, total), flexBasis: 0 };
  return (
    <View
      style={size}
      className={segment.colour === undefined ? 'h-full' : `h-full ${FILL[segment.colour]}`}
    />
  );
}

export const MemoryBar = memo(function MemoryBar({
  total,
  segments,
  unit = 'GB',
  showTotal = true,
}: MemoryBarProps): ReactNode {
  return (
    <View className="gap-2">
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={memorySummary(total, segments, unit)}
        className="h-4 flex-row gap-0.5 overflow-hidden rounded-full bg-surface-3"
      >
        {segments.map((segment) =>
          segment.value > 0 ? <Piece key={segment.label} segment={segment} total={total} /> : null,
        )}
      </View>
      <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
        {segments.map((segment) => (
          <View key={segment.label} className="flex-row items-center gap-1.5">
            <Swatch colour={segment.colour ?? null} />
            <Text variant="footnote" tone="variant">
              {segment.label}
            </Text>
            <Text variant="footnote" className="tabular">
              {oneDecimal(segment.value)}
            </Text>
          </View>
        ))}
      </View>
      {showTotal ? (
        <Text variant="caption" tone="variant">
          {`of ${String(total)} ${unit}`}
        </Text>
      ) : null}
    </View>
  );
});
