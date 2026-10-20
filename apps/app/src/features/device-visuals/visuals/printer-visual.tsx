import type { ReactNode } from 'react';
import { View } from 'react-native';
import { G, Line, Path } from 'react-native-svg';
import { useColourResolver } from '../../../design/colour';
import { Canvas, scaled } from '../parts/frame';
import { useInk } from '../parts/ink';
import { rounded } from '../parts/shapes';
import {
  Cartridges,
  Gradients,
  Panel,
  PRINTER_HEIGHT,
  PRINTER_WIDTH,
  Shell,
  Trays,
  useBodyIds,
  usePrinterTints,
} from '../parts/printer-body';
import { Effects, Jam, type EffectTints } from '../parts/printer-effects';
import type { PrinterFacts, VisualProps } from '../types';

const SLOT = { x: 62, y: 138, w: 196, h: 12 };
const PART_SHAPES: Readonly<Record<string, string>> = {
  cover: 'M56 62H264L282 76H38Z',
  'input-tray': 'M92 66L102 22H218L228 66Z',
  output: 'M62 148H258L272 180H48Z',
};
const CARTRIDGE_BOX = { x: 40, y: 94, w: 156, h: 38 };

function Highlight({
  facts,
  hot,
}: {
  readonly facts: PrinterFacts;
  readonly hot: string;
}): ReactNode {
  const { part } = facts;
  if (part === null || part === 'none' || part === 'waste') return null;
  if (part === 'cartridge') {
    return (
      <Path
        d={rounded({
          x: CARTRIDGE_BOX.x,
          y: CARTRIDGE_BOX.y,
          w: CARTRIDGE_BOX.w,
          h: CARTRIDGE_BOX.h,
          r: 8,
        })}
        fill="none"
        stroke={hot}
        strokeWidth={2.4}
      />
    );
  }
  const shape = PART_SHAPES[part];
  if (shape === undefined) {
    return (
      <Path
        d={rounded({ x: SLOT.x, y: SLOT.y, w: SLOT.w, h: SLOT.h, r: 6 })}
        fill="none"
        stroke={hot}
        strokeWidth={2.4}
      />
    );
  }
  return <Path d={shape} fill="none" stroke={hot} strokeWidth={2.4} />;
}

function Offline(): ReactNode {
  const colour = useColourResolver();
  return (
    <Path
      d={rounded({ x: 24, y: 82, w: 272, h: 92, r: 18 })}
      fill="none"
      stroke={colour('on-surface-faint')}
      strokeWidth={1.6}
      strokeDasharray="6 5"
    />
  );
}

function useEffectTints(): EffectTints {
  const colour = useColourResolver();
  const tints = usePrinterTints();
  return { paper: tints.paper, hot: tints.hot, good: tints.good, warm: colour('caution') };
}

export interface PrinterIllustrationProps {
  readonly facts: PrinterFacts;
  readonly width: number;
  readonly running: boolean;
}

export function PrinterIllustration({
  facts,
  width,
  running,
}: PrinterIllustrationProps): ReactNode {
  const px = (width / PRINTER_WIDTH) * 100;
  const ink = useInk();
  const ids = useBodyIds();
  const tints = usePrinterTints();
  const effects = useEffectTints();
  const box = { x: 0, y: 0, w: PRINTER_WIDTH, h: PRINTER_HEIGHT };
  return (
    <View className="relative">
      <Canvas px={px} box={box}>
        <Gradients ids={ids} ink={ink} />
        <Line
          x1={30}
          y1={194}
          x2={290}
          y2={194}
          stroke={ink.edge}
          strokeOpacity={0.4}
          strokeWidth={5}
          strokeLinecap="round"
        />
        <Trays ink={ink} facts={facts} hatch={ids.hatch} />
        <Shell ids={ids} ink={ink} facts={facts} />
        <Cartridges ink={ink} facts={facts} ids={ids} />
        <Panel ink={ink} facts={facts} tints={tints} />
        <G>
          <Highlight facts={facts} hot={tints.hot} />
          {facts.phase === 'offline' ? <Offline /> : null}
        </G>
      </Canvas>
      <Jam facts={facts} px={px} ink={ink} tints={effects} />
      <Effects facts={facts} px={px} running={running} ink={ink} tints={effects} />
    </View>
  );
}

export function PrinterVisual({ state, px, moving }: VisualProps): ReactNode {
  const facts = state.printer;
  if (facts === undefined) return null;
  const width = scaled(100, px);
  return (
    <View className="absolute inset-0 items-center justify-center">
      <PrinterIllustration facts={facts} width={width} running={moving} />
    </View>
  );
}
