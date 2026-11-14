import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { cn } from '../../../design/cn';
import { Figure, type FigureSize } from '../../../components/figure';
import { Text } from '../../../components/text';
import type { VisualSize, VisualTone } from '../types';
import { boxStyle, scaled, type Box } from './frame';
import { fitScale, type Natural } from './readout-fit';

export type ReadoutSizes = Partial<Readonly<Record<VisualSize, FigureSize>>>;

export const DIAL_FIGURES: ReadoutSizes = { card: 's', hero: 'l' };

function scaleStyle(scale: number): ViewStyle {
  return { transform: [{ scale }] };
}

function Fitted({
  room,
  children,
}: {
  readonly room: Natural;
  readonly children: ReactNode;
}): ReactNode {
  const [natural, setNatural] = useState<Natural | null>(null);
  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setNatural((last) =>
      last !== null && last.width === width && last.height === height ? last : { width, height },
    );
  };
  return (
    <View
      onLayout={onLayout}
      className={cn('items-center', natural === null && 'opacity-0')}
      style={scaleStyle(fitScale(room, natural))}
    >
      {children}
    </View>
  );
}

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
      <Fitted room={{ width: scaled(box.w, px), height: scaled(box.h, px) }}>
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
      </Fitted>
    </View>
  );
}
