import { useRef, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useMotion } from '../design/motion';
import { useOnScreen } from '../design/visibility';
import { Text } from './text';
import { TONE_TEXT, type Tone } from './tone';
import { isCountable, useCountUp } from './use-count-up';

export type FigureSize = 's' | 'm' | 'l' | 'xl';

const SIZE: Readonly<Record<FigureSize, string>> = {
  s: 'text-figure-s',
  m: 'text-figure-m tracking-tight',
  l: 'text-figure-l tracking-tight',
  xl: 'text-figure-xl tracking-tighter',
};

const UNIT: Readonly<Record<FigureSize, 'footnote' | 'callout' | 'title-3' | 'title-2'>> = {
  s: 'footnote',
  m: 'callout',
  l: 'title-3',
  xl: 'title-2',
};

export interface FigureProps {
  readonly value: string;
  readonly unit?: string;
  readonly size?: FigureSize;
  readonly tone?: Tone;
  readonly stale?: boolean;
}

export function FigureText({
  text,
  unit,
  size,
  tone,
  stale,
  frame,
  onLayout,
}: {
  readonly text: string;
  readonly unit: string | undefined;
  readonly size: FigureSize;
  readonly tone: Tone;
  readonly stale: boolean;
  readonly frame?: RefObject<View | null>;
  readonly onLayout?: (() => void) | undefined;
}): ReactNode {
  const shown: Tone = stale ? 'faint' : tone;
  return (
    <View ref={frame} onLayout={onLayout} className="flex-row items-baseline gap-1">
      <Text className={cn('font-sans-medium tabular', SIZE[size], TONE_TEXT[shown])}>{text}</Text>
      {unit === undefined ? null : (
        <Text variant={UNIT[size]} tone={stale ? 'faint' : 'variant'}>
          {unit}
        </Text>
      )}
    </View>
  );
}

function CountingFigure({
  value,
  unit,
  size = 'm',
  tone = 'default',
  stale = false,
}: FigureProps): ReactNode {
  const frame = useRef<View>(null);
  const { reduced } = useMotion();
  const { visible, onLayout } = useOnScreen(frame, undefined, !reduced);
  const counted = useCountUp(value, visible && !reduced);
  return (
    <FigureText
      text={counted}
      unit={unit}
      size={size}
      tone={tone}
      stale={stale}
      frame={frame}
      onLayout={onLayout}
    />
  );
}

export function Figure(props: FigureProps): ReactNode {
  if (isCountable(props.value)) return <CountingFigure {...props} />;
  return (
    <FigureText
      text={props.value}
      unit={props.unit}
      size={props.size ?? 'm'}
      tone={props.tone ?? 'default'}
      stale={props.stale ?? false}
    />
  );
}
