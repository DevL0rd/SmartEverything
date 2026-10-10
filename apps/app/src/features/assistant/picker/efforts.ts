import { AI_EFFORTS } from '@smarteverything/domain';
import { titleCase } from '../../../format/text';

const LABELS: Readonly<Record<string, string>> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

function rankOf(effort: string): number {
  const index = AI_EFFORTS.findIndex((known) => known === effort);
  return index === -1 ? AI_EFFORTS.length : index;
}

export function orderedEfforts(efforts: readonly string[]): readonly string[] {
  return [...efforts].sort((left, right) => rankOf(left) - rankOf(right));
}

export function effortLabel(effort: string): string {
  return LABELS[effort] ?? titleCase(effort);
}
