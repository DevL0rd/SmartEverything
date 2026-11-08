import type { Detent } from './bottom-sheet';

export interface SheetFrame {
  readonly sized: { readonly height: number } | { readonly maxHeight: number };
  readonly body: string;
}

export function sheetFrame(detents: readonly Detent[], full: number): SheetFrame {
  return detents.includes('fit')
    ? { sized: { maxHeight: full }, body: 'min-h-0 shrink' }
    : { sized: { height: full }, body: 'min-h-0 flex-1' };
}
