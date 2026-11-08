import type { ReactNode } from 'react';
import { Circle, Path } from 'react-native-svg';
import { useColourResolver } from '../../../design/colour';
import type { PrinterFacts } from '../types';
import { useInk, type VisualInk } from './ink';
import { rounded } from './shapes';

interface Tints {
  readonly hot: string;
  readonly good: string;
}

export function usePrinterTints(): Tints {
  const colour = useColourResolver();
  return { hot: colour('critical'), good: colour('positive') };
}

export function Panel({
  ink,
  facts,
  tints,
}: {
  readonly ink: VisualInk;
  readonly facts: PrinterFacts;
  readonly tints: Tints;
}): ReactNode {
  const asleep = facts.phase === 'asleep';
  return (
    <>
      <Path
        d={rounded({ x: 226, y: 98, w: 52, h: 28, r: 7 })}
        fill={ink.well}
        fillOpacity={0.75}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
      <Circle
        cx={238}
        cy={112}
        r={3.4}
        fill={facts.phase === 'stopped' ? tints.hot : tints.good}
        fillOpacity={asleep ? 0.3 : 1}
      />
      {asleep ? (
        <Path d="M262 104a6 6 0 1 0 6 8a5 5 0 0 1-6-8z" fill={ink.sheen} fillOpacity={0.8} />
      ) : (
        <>
          <Path d={rounded({ x: 248, y: 105, w: 24, h: 5, r: 2 })} fill={ink.faint} />
          <Path d={rounded({ x: 248, y: 114, w: 16, h: 4, r: 2 })} fill={ink.faint} />
        </>
      )}
      <Path
        d={rounded({ x: 238, y: 140, w: 40, h: 20, r: 5 })}
        fill={ink.dark}
        stroke={facts.part === 'waste' ? tints.hot : ink.edge}
        strokeWidth={facts.part === 'waste' ? 2 : 0.8}
      />
      <Path
        d={rounded({ x: 241, y: 143, w: Math.max(0, 34 * (facts.waste ?? 0)), h: 14, r: 3 })}
        fill={facts.part === 'waste' ? tints.hot : ink.faint}
      />
    </>
  );
}

export function useBodyInk(): VisualInk {
  return useInk();
}
