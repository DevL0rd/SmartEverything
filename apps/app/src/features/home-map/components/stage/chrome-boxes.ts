import { useMemo, useState } from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import type { ChromeBox, StageInsets } from '../../../../components/house-map/stage-fit';

export type ChromeBar = 'top' | 'bottom';

export type ChromePiece = 'switcher' | 'floors' | 'pill' | 'tools' | 'notes';

const PIECE_BAR: Readonly<Record<ChromePiece, ChromeBar>> = {
  switcher: 'top',
  floors: 'top',
  pill: 'bottom',
  tools: 'bottom',
  notes: 'bottom',
};

interface Measured {
  readonly origin?: LayoutRectangle;
  readonly bars: Partial<Record<ChromeBar, LayoutRectangle>>;
  readonly pieces: Partial<Record<ChromePiece, LayoutRectangle>>;
}

function same(left: LayoutRectangle | undefined, right: LayoutRectangle): boolean {
  return (
    left?.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function placedBox(measured: Measured, piece: ChromePiece): ChromeBox | null {
  const box = measured.pieces[piece];
  const bar = measured.bars[PIECE_BAR[piece]];
  if (box === undefined || bar === undefined || box.width === 0 || box.height === 0) return null;
  const x0 = measured.origin?.x ?? 0;
  const y0 = measured.origin?.y ?? 0;
  return { x: x0 + bar.x + box.x, y: y0 + bar.y + box.y, w: box.width, h: box.height };
}

export function chromeBoxesOf(
  measured: Measured,
  shown: readonly ChromePiece[],
): readonly ChromeBox[] {
  return shown.flatMap((piece) => {
    const box = placedBox(measured, piece);
    return box === null ? [] : [box];
  });
}

export const NO_CHROME_INSETS: StageInsets = { top: 0, bottom: 0 };

export function chromeInsetsOf(measured: Measured, shown: readonly ChromePiece[]): StageInsets {
  const { origin } = measured;
  if (origin === undefined) return NO_CHROME_INSETS;
  return shown.reduce((insets, piece) => {
    const box = placedBox(measured, piece);
    if (box === null) return insets;
    return PIECE_BAR[piece] === 'top'
      ? { ...insets, top: Math.max(insets.top, box.y + box.h) }
      : { ...insets, bottom: Math.max(insets.bottom, origin.y + origin.height - box.y) };
  }, NO_CHROME_INSETS);
}

export interface ChromeMeasure {
  readonly boxes: readonly ChromeBox[];
  readonly insets: StageInsets;
  readonly onOrigin: (event: LayoutChangeEvent) => void;
  readonly onBar: (bar: ChromeBar) => (event: LayoutChangeEvent) => void;
  readonly onPiece: (piece: ChromePiece) => (event: LayoutChangeEvent) => void;
}

function isPiece(name: string): name is ChromePiece {
  return name in PIECE_BAR;
}

export function useChromeBoxes(shown: readonly ChromePiece[]): ChromeMeasure {
  const [measured, setMeasured] = useState<Measured>({ bars: {}, pieces: {} });
  const key = shown.join(' ');
  const boxes = useMemo(
    () => chromeBoxesOf(measured, key.split(' ').filter(isPiece)),
    [measured, key],
  );
  const insets = useMemo(
    () => chromeInsetsOf(measured, key.split(' ').filter(isPiece)),
    [measured, key],
  );
  return {
    boxes,
    insets,
    onOrigin: (event): void => {
      const { layout } = event.nativeEvent;
      setMeasured((last) => (same(last.origin, layout) ? last : { ...last, origin: layout }));
    },
    onBar:
      (bar) =>
      (event): void => {
        const { layout } = event.nativeEvent;
        setMeasured((last) =>
          same(last.bars[bar], layout) ? last : { ...last, bars: { ...last.bars, [bar]: layout } },
        );
      },
    onPiece:
      (piece) =>
      (event): void => {
        const { layout } = event.nativeEvent;
        setMeasured((last) =>
          same(last.pieces[piece], layout)
            ? last
            : { ...last, pieces: { ...last.pieces, [piece]: layout } },
        );
      },
  };
}
