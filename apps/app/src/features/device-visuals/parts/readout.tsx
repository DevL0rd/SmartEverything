import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Figure, type FigureSize } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { VisualSize, VisualTone } from '../types';
import { boxStyle, type Box } from './frame';

export type ReadoutSizes = Partial<Readonly<Record<VisualSize, FigureSize>>>;

export const DIAL_FIGURES: ReadoutSizes = { card: 's', hero: 'l' };

export function Readout({
  box,
  px,
  size,
  tone,
  figures,
  value,
  unit,
  caption,
}: {
  readonly box: Box;
  readonly px: number;
  readonly size: VisualSize;
  readonly tone: VisualTone;
  readonly figures: ReadoutSizes;
  readonly value: string;
  readonly unit: string | null;
  readonly caption?: string;
}): ReactNode {
  const figure = figures[size];
  if (figure === undefined) {
    return null;
  }
  return (
    <View pointerEvents="none" style={boxStyle(box, px)} className="items-center justify-center">
      <Figure
        value={value}
        size={figure}
        stale={tone === 'offline'}
        {...(unit === null ? {} : { unit })}
      />
      {caption === undefined || size !== 'hero' ? null : (
        <Text variant="footnote" tone="variant">
          {caption}
        </Text>
      )}
    </View>
  );
}
