import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { Text } from '../text';
import type { ChartSeries } from './chart-model';

const SWATCH_HEIGHT = 3;

export function Swatch({ colour }: { readonly colour: ColourRole | null }): ReactNode {
  const fill = useColour(colour ?? 'surface-3');
  const edge = useColour('outline');
  const paint =
    colour === null
      ? { height: SWATCH_HEIGHT, backgroundColor: fill, borderColor: edge }
      : { height: SWATCH_HEIGHT, backgroundColor: fill };
  return (
    <View
      style={paint}
      className={colour === null ? 'w-4 rounded-full border' : 'w-4 rounded-full'}
    />
  );
}

function LegendEntry({
  entry,
  value,
}: {
  readonly entry: ChartSeries;
  readonly value: string | null;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-1.5">
      <Swatch colour={entry.colour} />
      <Text variant="footnote" tone="variant">
        {entry.label}
      </Text>
      {value === null ? null : (
        <Text variant="footnote" className="tabular">
          {value}
        </Text>
      )}
    </View>
  );
}

export function ChartLegend({
  series,
  valueOf,
}: {
  readonly series: readonly ChartSeries[];
  readonly valueOf?: (entry: ChartSeries) => string | null;
}): ReactNode {
  return (
    <View aria-hidden className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
      {series.map((entry) => (
        <LegendEntry key={entry.label} entry={entry} value={valueOf?.(entry) ?? null} />
      ))}
    </View>
  );
}
