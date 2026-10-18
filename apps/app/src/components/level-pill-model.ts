import { percent } from '../format/number';
import type { StatusTone } from './tone';

export const LEVEL_SEGMENTS = 4;
export const LOW_LEVEL = 20;

export type LevelTone = StatusTone | 'neutral';

export interface LevelLook {
  readonly lit: number;
  readonly tone: LevelTone;
  readonly word: string;
}

export function levelLook(reading: number): LevelLook {
  const level = Math.min(100, Math.max(0, reading));
  const low = level <= LOW_LEVEL;
  return {
    lit: Math.ceil((level / 100) * LEVEL_SEGMENTS),
    tone: low ? 'warning' : 'positive',
    word: low ? `Low · ${percent(level / 100)}` : percent(level / 100),
  };
}
