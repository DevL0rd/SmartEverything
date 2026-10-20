import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Sparkline, type ChartPoint } from '../../../components/charts';
import { LiveFigure } from '../../../components/live-figure';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';

const TREND_HEIGHT = 40;

export interface CounterTileProps {
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly widest?: string;
  readonly note?: string;
  readonly trend?: readonly ChartPoint[];
  readonly colour?: ColourRole;
}

export function CounterTile({
  label,
  value,
  unit,
  widest,
  note,
  trend,
  colour = 'primary',
}: CounterTileProps): ReactNode {
  const drawn = trend !== undefined && trend.length >= 2;
  return (
    <View className="min-w-64 flex-1 flex-row items-center gap-3 rounded-md bg-surface-2 px-3 py-2.5">
      <View className="shrink-0 gap-0.5">
        <Text variant="caption" tone="variant">
          {label}
        </Text>
        <LiveFigure
          value={value}
          size="m"
          {...(unit === undefined ? {} : { unit })}
          {...(widest === undefined ? {} : { widest })}
        />
        {note === undefined ? null : (
          <Text variant="caption" tone="faint" className="tabular">
            {note}
          </Text>
        )}
      </View>
      <View aria-hidden className="min-w-0 flex-1 justify-center">
        {drawn ? <Sparkline points={trend} colour={colour} height={TREND_HEIGHT} area /> : null}
      </View>
    </View>
  );
}
