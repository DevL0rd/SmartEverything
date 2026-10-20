import type { BottleStats } from '@smarteverything/domain';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import { millilitres } from '../../../format/number';

type FaceKind = 'strip' | 'row' | 'panel';

export function faceKindOf(cls: FrameClass): FaceKind {
  switch (cls) {
    case 'xs':
    case 's':
    case 'm':
      return 'strip';
    case 'w':
      return 'row';
    case 'l':
    case 'xl':
      return 'panel';
  }
}

const HEADER_PX = { touch: 52, pointer: 44 } as const;

export function bodyHeightOf(frame: WidgetFrameBox): number {
  return Math.max(0, frame.height - HEADER_PX[frame.idiom]);
}

export function monthTotalMl(heatmap: BottleStats['heatmap'], today: string): number {
  const month = today.slice(0, 7);
  return heatmap
    .filter((entry) => entry.day.startsWith(month))
    .reduce((sum, entry) => sum + entry.ml, 0);
}

export function monthLine(heatmap: BottleStats['heatmap'], today: string): string {
  return `${millilitres(Math.round(monthTotalMl(heatmap, today)))} this month`;
}

export function goalsMetLine(completion: readonly boolean[]): string {
  const met = completion.filter(Boolean).length;
  return `Goal reached ${String(met)} of the last ${String(completion.length)} days`;
}

export function shortLitres(ml: number): string {
  return ml >= 1000 ? `${(Math.round(ml / 100) / 10).toString()} L` : millilitres(Math.round(ml));
}
