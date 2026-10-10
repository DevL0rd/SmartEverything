import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useTween } from '../use-tween';
import type { ColourRole } from '../../design/tokens';
import { percent } from '../../format/number';

export interface ProgressBarProps {
  readonly progress: number;
  readonly colour: ColourRole;
  readonly label: string;
  readonly thick?: boolean;
}

export function ProgressBar({
  progress,
  colour,
  label,
  thick = false,
}: ProgressBarProps): ReactNode {
  const fill = useColour(colour);
  const share = useTween(Math.min(1, Math.max(0, progress)), !useMotion().reduced);
  const track = { backgroundColor: fill, opacity: 0.18 };
  const bar = { backgroundColor: fill, flex: share };
  const rest = { flex: 1 - share };
  const dot = { backgroundColor: fill };
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${percent(share)}`}
      className={
        thick ? 'h-2.5 w-full flex-row items-center' : 'h-1.5 w-full flex-row items-center'
      }
    >
      <View style={track} className="absolute inset-0 rounded-full" />
      {share > 0 ? (
        <>
          <View style={bar} className="h-full rounded-full" />
          <View style={rest} />
        </>
      ) : (
        <View style={dot} className={thick ? 'size-2.5 rounded-full' : 'size-1.5 rounded-full'} />
      )}
    </View>
  );
}
