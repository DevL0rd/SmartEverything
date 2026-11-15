import type { PlannerNoiseColour } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { rectPath } from '../../../components/charts/night-bars-model';
import { useColour } from '../../../design/colour';
import { NOISE_SLOPES } from './sleep-sound-model';

const BARS = 12;

const RIPPLE = [0.06, -0.04, 0.08, -0.06, 0.03, -0.02, 0.07, -0.05, 0.04, -0.03, 0.05, -0.04];

export function spectrumOf(colour: PlannerNoiseColour): readonly number[] {
  const slope = NOISE_SLOPES[colour];
  return Array.from({ length: BARS }, (_, index) => {
    const along = index / (BARS - 1);
    const level = 0.9 - slope * 0.7 * Math.sqrt(along) + (RIPPLE[index] ?? 0);
    return Math.min(1, Math.max(0.12, level));
  });
}

export function NoiseSpectrum({
  colour,
  width,
  height,
}: {
  readonly colour: PlannerNoiseColour;
  readonly width: number;
  readonly height: number;
}): ReactNode {
  const fill = useColour('sleep-core');
  const levels = spectrumOf(colour);
  const slot = width / levels.length;
  const bar = Math.max(1, slot * 0.6);
  return (
    <View aria-hidden>
      <Svg width={width} height={height}>
        {levels.map((level, index) => (
          <Path
            key={index}
            d={rectPath(
              {
                x: index * slot + (slot - bar) / 2,
                width: bar,
                top: height * (1 - level),
                bottom: height,
              },
              bar / 2,
            )}
            fill={fill}
          />
        ))}
      </Svg>
    </View>
  );
}
