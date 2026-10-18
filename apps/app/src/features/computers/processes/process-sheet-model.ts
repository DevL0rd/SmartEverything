import { PROCESS_NICE } from '@smarteverything/domain';
import type { Priority } from '../data/computer-processes';

export const PRIORITY_OPTIONS: readonly { readonly value: Priority; readonly label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'low', label: 'Low' },
  { value: 'lowest', label: 'Lowest' },
];

export function priorityOf(niceness: number | null): Priority {
  if (niceness === null) return 'normal';
  const levels: readonly Priority[] = ['normal', 'low', 'lowest'];
  return levels.reduce((best, level) =>
    Math.abs(PROCESS_NICE[level] - niceness) < Math.abs(PROCESS_NICE[best] - niceness)
      ? level
      : best,
  );
}

export function belongsTo(user: string): string {
  return `Belongs to ${user}. You can’t end, pause or change it from here.`;
}
