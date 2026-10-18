import { cn } from '../design/cn';
import type { LevelShape } from './level-math';

type Idiom = 'touch' | 'pointer';

const SHAPE: Readonly<Record<LevelShape, Readonly<Record<Idiom, string>>>> = {
  bar: { touch: 'relative h-12 rounded-md', pointer: 'relative h-10 rounded-md' },
  slim: { touch: 'relative h-8 rounded-md', pointer: 'relative h-7 rounded-md' },
  row: { touch: 'relative h-12 rounded-md', pointer: 'relative h-10 rounded-md' },
  rowOpen: { touch: 'relative h-12 rounded-t-md', pointer: 'relative h-10 rounded-t-md' },
  chip: { touch: 'relative h-8 rounded-full', pointer: 'relative h-8 rounded-full' },
  fill: { touch: 'absolute inset-0', pointer: 'absolute inset-0' },
};

const WHITE_SLIM: Readonly<Record<Idiom, string>> = {
  touch: 'relative h-10 rounded-md',
  pointer: 'relative h-8 rounded-md',
};

export interface LevelFrame {
  readonly shape: LevelShape | undefined;
  readonly white: boolean;
  readonly disabled: boolean;
  readonly className: string | undefined;
}

function sizeClass(frame: LevelFrame, idiom: Idiom): string {
  const shape = frame.shape ?? 'bar';
  if (frame.white && shape === 'slim') {
    return WHITE_SLIM[idiom];
  }
  return SHAPE[shape][idiom];
}

export function levelFrameClass(frame: LevelFrame, idiom: Idiom): string {
  const filled = frame.shape === 'fill';
  return cn(
    'min-w-0 overflow-hidden',
    !filled && 'border-hairline border-track',
    filled ? 'bg-surface-1' : 'bg-surface-2',
    sizeClass(frame, idiom),
    frame.disabled && 'border-dashed',
    frame.className,
  );
}
