import type { ReactNode } from 'react';
import { memo, useRef } from 'react';
import { View } from 'react-native';
import { useMotion } from '../design/motion';
import { useOnScreen } from '../design/visibility';
import { FigureText, type FigureProps } from './figure';
import { isCountable, useCountUp } from './use-count-up';

export interface LiveFigureProps extends FigureProps {
  readonly widest?: string;
  readonly align?: 'start' | 'center';
}

const ALIGN = { start: 'relative self-start', center: 'relative self-center' } as const;

const COUNT_MIN_CHANGE = 0.1;

export const LiveFigure = memo(function LiveFigure({
  value,
  unit,
  size = 'm',
  tone = 'default',
  stale = false,
  widest = value,
  align = 'start',
}: LiveFigureProps): ReactNode {
  const frame = useRef<View>(null);
  const { reduced } = useMotion();
  const counting = isCountable(value) && !reduced;
  const { visible, onLayout } = useOnScreen(frame, undefined, counting);
  const shown = useCountUp(value, visible && counting, COUNT_MIN_CHANGE);
  return (
    <View
      ref={frame}
      accessible
      accessibilityLabel={unit === undefined ? value : `${value} ${unit}`}
      className={ALIGN[align]}
      onLayout={onLayout}
    >
      <View aria-hidden className="opacity-0">
        <FigureText text={widest} unit={unit} size={size} tone={tone} stale={stale} />
      </View>
      <View aria-hidden className="absolute left-0 top-0">
        <FigureText text={shown} unit={unit} size={size} tone={tone} stale={stale} />
      </View>
    </View>
  );
});
