import type { ReactNode } from 'react';
import { Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { PlotFrame } from '../../toothbrush/charts/plot-frame';
import { PLOT_HEIGHT, PLOT_PAD } from '../../toothbrush/model/care-model';
import { FACE_LEVELS } from '../model/face-model';
import { facesLabel, type FaceBar } from '../model/stats-model';

const GAP = 3;

function barPath(x: number, width: number, level: number): string {
  const height = ((PLOT_HEIGHT - 2 * PLOT_PAD) * level) / FACE_LEVELS;
  const bottom = PLOT_HEIGHT - PLOT_PAD;
  return `M${x.toFixed(1)} ${bottom.toFixed(1)}V${(bottom - height).toFixed(1)}H${(x + width).toFixed(1)}V${bottom.toFixed(1)}Z`;
}

function Bars({
  bars,
  width,
}: {
  readonly bars: readonly FaceBar[];
  readonly width: number;
}): ReactNode {
  const fill = useColour('positive');
  const outline = useColour('on-surface-variant');
  const slot = (width - 2 * PLOT_PAD) / Math.max(1, bars.length);
  return bars.map((bar, index) => {
    const x = PLOT_PAD + index * slot + GAP / 2;
    const level = bar.level ?? 0;
    if (level <= 0) {
      return (
        <Path
          key={bar.key}
          d={`M${x.toFixed(1)} ${String(PLOT_HEIGHT - PLOT_PAD)}H${(x + slot - GAP).toFixed(1)}`}
          stroke={outline}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      );
    }
    return bar.special ? (
      <Path key={bar.key} d={barPath(x, slot - GAP, level)} fill={fill} />
    ) : (
      <Path
        key={bar.key}
        d={barPath(x, slot - GAP, level)}
        fill="none"
        stroke={outline}
        strokeWidth={1.5}
      />
    );
  });
}

export function FaceStrip({ bars }: { readonly bars: readonly FaceBar[] }): ReactNode {
  return (
    <PlotFrame
      label={facesLabel(bars)}
      note="Filled bars: a special face. Outlined: the plain face. A dash: no face shown."
    >
      {(width) => <Bars bars={bars} width={width} />}
    </PlotFrame>
  );
}
