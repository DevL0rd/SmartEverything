import type { ReactNode } from 'react';
import {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Pattern,
  Rect,
  Stop,
} from 'react-native-svg';
import { useColourResolver } from '../../../design/colour';
import type { PrinterFacts, PrinterInk } from '../types';
import { useSvgId } from './frame';
import { useInk, type VisualInk } from './ink';
import { questionPath, rounded } from './shapes';

export const PRINTER_WIDTH = 320;
export const PRINTER_HEIGHT = 204;

interface Tints {
  readonly paper: string;
  readonly ink: string;
  readonly hot: string;
  readonly good: string;
  readonly empty: string;
}

export function usePrinterTints(): Tints {
  const colour = useColourResolver();
  return {
    paper: colour('on-surface'),
    ink: colour('on-surface-variant'),
    hot: colour('critical'),
    good: colour('positive'),
    empty: colour('outline-variant'),
  };
}

function Hatch({ id, ink }: { readonly id: string; readonly ink: VisualInk }): ReactNode {
  return (
    <Pattern
      id={id}
      width={6}
      height={6}
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(45)"
    >
      <Rect width={6} height={6} fill={ink.light} />
      <Line x1={0} y1={0} x2={0} y2={6} stroke={ink.faint} strokeWidth={1.4} />
    </Pattern>
  );
}

interface WindowBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function Window({
  entry,
  box,
  ink,
  hatch,
}: {
  readonly entry: PrinterInk;
  readonly box: WindowBox;
  readonly ink: VisualInk;
  readonly hatch: string;
}): ReactNode {
  const { x, y, width, height } = box;
  const fill = entry.share === null ? 0 : Math.max(0, (height - 4) * entry.share);
  const inner = { x: x + 2, y: y + 2, w: width - 4, h: height - 4, r: 2.5 };
  return (
    <G>
      <Path
        d={rounded({ x, y, w: width, h: height, r: 4 })}
        fill={ink.well}
        fillOpacity={0.5}
        stroke={entry.warn ? '#f2b45e' : ink.edge}
        strokeWidth={entry.warn ? 1.6 : 0.8}
      />
      {entry.share === null ? (
        <Path d={rounded(inner)} fill={`url(#${hatch})`} />
      ) : (
        <Path d={rounded({ ...inner, y: y + height - 2 - fill, h: fill })} fill={entry.colour} />
      )}
      <Path
        d={rounded({ x: x + 2, y: y + 2, w: 2, h: height - 4, r: 1 })}
        fill={ink.sheen}
        fillOpacity={0.35}
      />
    </G>
  );
}

function Windows({
  inks,
  x0,
  width,
  gap,
  y,
  height,
  ink,
  hatch,
}: {
  readonly inks: readonly PrinterInk[];
  readonly x0: number;
  readonly width: number;
  readonly gap: number;
  readonly y: number;
  readonly height: number;
  readonly ink: VisualInk;
  readonly hatch: string;
}): ReactNode {
  return inks
    .slice(0, 4)
    .map((entry, index) => (
      <Window
        key={`${entry.colour}-${String(index)}`}
        entry={entry}
        box={{ x: x0 + index * (width + gap), y, width, height }}
        ink={ink}
        hatch={hatch}
      />
    ));
}

function Stack({
  count,
  x,
  y,
  width,
  ink,
}: {
  readonly count: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly ink: VisualInk;
}): ReactNode {
  return Array.from({ length: count }, (_, index) => (
    <Path
      d={rounded({ x: x + (index % 2) * 1.5, y: y - index * 2.2, w: width, h: 2.4, r: 1 })}
      key={index}
      fill={ink.sheen}
      fillOpacity={0.85}
      stroke={ink.edge}
      strokeWidth={0.4}
    />
  ));
}

export function Gradients({
  ids,
  ink,
}: {
  readonly ids: { readonly smoke: string; readonly hatch: string; readonly body: string };
  readonly ink: VisualInk;
}): ReactNode {
  return (
    <Defs>
      <Hatch id={ids.hatch} ink={ink} />
      <LinearGradient id={ids.smoke} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={ink.well} stopOpacity={0.55} />
        <Stop offset="1" stopColor={ink.well} stopOpacity={0.9} />
      </LinearGradient>
      <LinearGradient id={ids.body} x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor={ink.light} />
        <Stop offset="1" stopColor={ink.dark} />
      </LinearGradient>
      <ClipPath id={`${ids.body}-out`}>
        <Path d={rounded({ x: 52, y: 140, w: 216, h: 64, r: 0 })} />
      </ClipPath>
    </Defs>
  );
}

export function Shell({
  ids,
  ink,
  facts,
}: {
  readonly ids: { readonly body: string };
  readonly ink: VisualInk;
  readonly facts: PrinterFacts;
}): ReactNode {
  const lid = facts.mfp ? 'M62 50H258L278 68H42Z' : 'M56 62H264L282 76H38Z';
  return (
    <>
      <Path
        d={rounded({ x: 28, y: 86, w: 264, h: 84, r: 16 })}
        fill={`url(#${ids.body})`}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
      <Path d="M50 70H270L292 92H28Z" fill={ink.light} stroke={ink.edge} strokeWidth={0.8} />
      <Path d={lid} fill={ink.dark} stroke={ink.edge} strokeWidth={0.8} />
      <Path
        d={rounded({ x: 62, y: 138, w: 196, h: 12, r: 6 })}
        fill={ink.well}
        fillOpacity={0.85}
      />
    </>
  );
}

function PaperStack({
  ink,
  paper,
  top,
  hatch,
}: {
  readonly ink: VisualInk;
  readonly paper: number | null;
  readonly top: number;
  readonly hatch: string;
}): ReactNode {
  if (paper === null) {
    return (
      <>
        <Path d={rounded({ x: 108, y: top - 38, w: 104, h: 38, r: 2 })} fill={`url(#${hatch})`} />
        <Path
          d={questionPath(160, top - 24, 9)}
          fill="none"
          stroke={ink.faint}
          strokeWidth={3}
          strokeLinecap="round"
        />
      </>
    );
  }
  const height = 4 + paper * 16;
  return (
    <Path
      d={rounded({ x: 100, y: top - height, w: 120, h: height, r: 2 })}
      fill={ink.sheen}
      fillOpacity={0.9}
      stroke={ink.edge}
      strokeWidth={0.5}
    />
  );
}

export function Trays({
  ink,
  facts,
  hatch,
}: {
  readonly ink: VisualInk;
  readonly facts: PrinterFacts;
  readonly hatch: string;
}): ReactNode {
  const top = facts.mfp ? 52 : 66;
  return (
    <>
      <Path d="M62 148H258L272 180H48Z" fill={ink.light} stroke={ink.edge} strokeWidth={0.8} />
      <Stack
        count={Math.max(Math.round(facts.output * 8), facts.part === 'output' ? 14 : 0)}
        x={86}
        y={176}
        width={148}
        ink={ink}
      />
      <Path
        d={facts.mfp ? 'M92 52L102 12H218L228 52Z' : 'M92 66L102 22H218L228 66Z'}
        fill={ink.dark}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
      <PaperStack ink={ink} paper={facts.paper} top={top} hatch={hatch} />
    </>
  );
}

function Inkjet({ ink, smoke }: { readonly ink: VisualInk; readonly smoke: string }): ReactNode {
  return (
    <>
      <Path
        d={rounded({ x: 44, y: 98, w: 150, h: 30, r: 8 })}
        fill={`url(#${smoke})`}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
      <Line x1={52} y1={122} x2={186} y2={122} stroke={ink.faint} strokeWidth={1} />
    </>
  );
}

function Laser({
  ink,
  facts,
  hatch,
}: {
  readonly ink: VisualInk;
  readonly facts: PrinterFacts;
  readonly hatch: string;
}): ReactNode {
  return (
    <>
      <Path
        d={rounded({ x: 40, y: 94, w: 156, h: 36, r: 6 })}
        fill={ink.dark}
        stroke={ink.edge}
        strokeWidth={0.8}
      />
      <Windows
        inks={facts.inks}
        x0={48}
        width={28}
        gap={6}
        y={100}
        height={24}
        ink={ink}
        hatch={hatch}
      />
      <Path d={rounded({ x: 108, y: 132, w: 40, h: 4, r: 2 })} fill={ink.faint} />
    </>
  );
}

export function Cartridges({
  ink,
  facts,
  ids,
}: {
  readonly ink: VisualInk;
  readonly facts: PrinterFacts;
  readonly ids: { readonly smoke: string; readonly hatch: string };
}): ReactNode {
  if (facts.variant === 'inkjet') return <Inkjet ink={ink} smoke={ids.smoke} />;
  if (facts.variant === 'laser') return <Laser ink={ink} facts={facts} hatch={ids.hatch} />;
  return (
    <Windows
      inks={facts.inks}
      x0={44}
      width={12}
      gap={5}
      y={98}
      height={30}
      ink={ink}
      hatch={ids.hatch}
    />
  );
}

export function useBodyIds(): {
  readonly smoke: string;
  readonly hatch: string;
  readonly body: string;
} {
  return { smoke: useSvgId('pgs'), hatch: useSvgId('pgh'), body: useSvgId('pgb') };
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
