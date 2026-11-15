import { percent } from '../../../format/number';
import { plural } from '../../../format/text';
import {
  isSettled,
  type Choice,
  type UploadItem,
  type UploadQueue,
  type UploadState,
} from './upload-queue';

export interface ChoiceSpec {
  readonly choice: Choice;
  readonly label: string;
  readonly detail: string;
}

const CHOICES: readonly ChoiceSpec[] = [
  { choice: 'replace', label: 'Replace', detail: 'The file already there is overwritten.' },
  { choice: 'both', label: 'Keep both', detail: 'This one is saved with a number added.' },
  { choice: 'skip', label: 'Skip', detail: 'This file is not uploaded.' },
];

export function choicesOf(item: UploadItem): readonly ChoiceSpec[] {
  return item.state === 'conflict' ? CHOICES : [];
}

export function conflictsOf(items: readonly UploadItem[]): readonly UploadItem[] {
  return items.filter((item) => item.state === 'conflict');
}

export function allChoicesOf(items: readonly UploadItem[]): readonly ChoiceSpec[] {
  const count = conflictsOf(items).length;
  if (count < 2) return [];
  return CHOICES.map((spec) => ({
    ...spec,
    label: `${spec.label} all ${String(count)}`,
  }));
}

export function decideAll(queue: UploadQueue, items: readonly UploadItem[], choice: Choice): void {
  for (const item of conflictsOf(items)) queue.decide(item.id, choice);
}

export function conflictLineOf(item: UploadItem, folder: string): string | null {
  return item.state === 'conflict' ? `${item.name} is already in ${folder}` : null;
}

export function conflictTitleOf(count: number, folder: string): string {
  return `${plural(count, 'name')} already in ${folder}`;
}

const PLAIN_STATE: Readonly<Partial<Record<UploadState, string>>> = {
  waiting: 'Waiting',
  conflict: 'Already exists',
  paused: 'Paused',
  have: 'Already here',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
};

export function itemStateTextOf(item: UploadItem): string {
  const plain = PLAIN_STATE[item.state];
  if (plain !== undefined) return plain;
  if (item.state === 'sending') {
    return item.size === 0 ? 'Sending' : percent(Math.min(1, item.sent / item.size));
  }
  if (item.state === 'failed') return item.error ?? 'Failed';
  return item.storedAs === null ? 'Done' : `Done · named ${item.storedAs}`;
}

export function liveCountOf(items: readonly UploadItem[]): number {
  return items.filter((item) => !isSettled(item.state)).length;
}

export function sheetLineOf(items: readonly UploadItem[], folder: string, from: string): string {
  const live = liveCountOf(items);
  const conflicts = conflictsOf(items).length;
  if (conflicts > 0) {
    return `${conflictTitleOf(conflicts, folder)}. Choose what happens to each.`;
  }
  if (live === 0) return `Choose files on ${from} to send to ${folder}.`;
  return `${plural(live, 'file')} left, going to ${folder}`;
}
