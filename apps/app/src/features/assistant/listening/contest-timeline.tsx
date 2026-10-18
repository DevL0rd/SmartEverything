import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { CONTEST_WINDOW_MS, type ContestLine } from './contest-model';
import { NumberDot } from './number-dot';

const HALF_DOT = 12;

const INSET = 24;

function leftOf(left: number): { readonly left: number } {
  return { left };
}

function widthOf(width: number): { readonly width: number } {
  return { width };
}

function spokenOf(lines: readonly ContestLine[]): string {
  return lines
    .map(
      (line, index) => `${String(index + 1)} ${line.name} at ${String(line.afterMs)} milliseconds`,
    )
    .join(', ');
}

interface Scale {
  readonly lines: readonly ContestLine[];
  readonly axisMs: number;
  readonly span: number;
}

function Plot({ lines, axisMs, span }: Scale): ReactNode {
  const ticks = Array.from(
    { length: axisMs / CONTEST_WINDOW_MS + 1 },
    (_, step) => (step * CONTEST_WINDOW_MS * span) / axisMs,
  );
  return (
    <View className="h-8 justify-center rounded-full bg-surface-3 px-3">
      <View className="h-6">
        <View
          style={widthOf((CONTEST_WINDOW_MS * span) / axisMs)}
          className="absolute inset-y-0 left-0 rounded-l-full border border-primary/45 bg-primary/20"
        />
        {ticks.map((left) => (
          <View key={left} style={leftOf(left)} className="absolute inset-y-0 w-px bg-outline" />
        ))}
        {lines.map((line, index) => (
          <View
            key={`${line.name}-${String(line.afterMs)}`}
            style={leftOf((line.afterMs * span) / axisMs - HALF_DOT)}
            className="absolute top-0"
          >
            <NumberDot number={index + 1} outcome={line.outcome} />
          </View>
        ))}
      </View>
    </View>
  );
}

function Labels({ axisMs, span }: Pick<Scale, 'axisMs' | 'span'>): ReactNode {
  return (
    <View className="px-3">
      <View className="h-5">
        <View className="absolute left-0">
          <Text variant="caption" tone="faint">
            0
          </Text>
        </View>
        <View
          style={widthOf((CONTEST_WINDOW_MS * span) / axisMs)}
          className="absolute left-0 items-center"
        >
          <Text variant="caption" tone="variant">
            {`${String(CONTEST_WINDOW_MS / 1000)} s contest`}
          </Text>
        </View>
        <View className="absolute right-0">
          <Text variant="caption" tone="faint">
            {`${String(axisMs / 1000)} s`}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ContestTimeline({
  lines,
  axisMs,
}: {
  readonly lines: readonly ContestLine[];
  readonly axisMs: number;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const span = Math.max(0, width - INSET);
  return (
    <View
      role="img"
      accessibilityLabel={`When each source heard the wake: ${spokenOf(lines)}`}
      onLayout={onLayout}
      className="gap-1"
    >
      <Plot lines={lines} axisMs={axisMs} span={span} />
      <Labels axisMs={axisMs} span={span} />
    </View>
  );
}
