export type DeltaTone = 'neutral' | 'good' | 'bad';

export interface DeltaChip {
  readonly text: string;
  readonly tone: DeltaTone;
}

export type DeltaMeaning = 'neutral' | 'less-is-better' | 'more-is-better';

export function deltaChip(change: number | null, meaning: DeltaMeaning): DeltaChip | null {
  if (change === null) return null;
  const percent = Math.round(change * 100);
  if (percent === 0) return { text: 'Same as before', tone: 'neutral' };
  const text = `${percent > 0 ? '+' : '−'}${String(Math.abs(percent))}%`;
  if (meaning === 'neutral') return { text, tone: 'neutral' };
  const better = meaning === 'more-is-better' ? percent > 0 : percent < 0;
  return { text, tone: better ? 'good' : 'bad' };
}

export function shareDelta(change: number | null): DeltaChip | null {
  if (change === null) return null;
  const points = Math.round(change * 100);
  if (points === 0) return { text: 'Same as before', tone: 'neutral' };
  return { text: `${points > 0 ? '+' : '−'}${String(Math.abs(points))} pts`, tone: 'neutral' };
}

export function pagesMeaning(goalActive: boolean): DeltaMeaning {
  return goalActive ? 'less-is-better' : 'neutral';
}
