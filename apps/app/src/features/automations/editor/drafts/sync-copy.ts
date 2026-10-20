import type { AutomationProgramProblem } from '@smarteverything/domain';
import type { BadgeTone } from '../../../../components/badge';
import type { IconName } from '../../../../components/icon';
import { moment } from '../../../../format/time';
import type { RebaseNotice, SyncState, SyncStatus } from './draft-sync-model';

export interface ChipLook {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

const CHIP: Readonly<Record<SyncStatus, ChipLook>> = {
  saved: { label: 'Draft saved', tone: 'neutral', icon: 'circleCheck' },
  saving: { label: 'Saving…', tone: 'neutral', icon: 'folderSync' },
  unsaved: { label: 'Not saved yet', tone: 'neutral', icon: 'clock' },
  offline: { label: 'Not saved', tone: 'warning', icon: 'wifi' },
  conflict: { label: 'Needs a decision', tone: 'warning', icon: 'warning' },
  failed: { label: 'Not saved', tone: 'critical', icon: 'alert' },
};

export function chipLook(state: Pick<SyncState, 'status'>): ChipLook {
  return CHIP[state.status];
}

export function chipHint(state: Pick<SyncState, 'status' | 'failure'>): string | null {
  if (state.status === 'offline') return 'Can’t reach the Home Hub. Your last change is not saved.';
  if (state.status === 'failed') return state.failure ?? 'The draft could not be saved.';
  return null;
}

export interface ConflictCopy {
  readonly title: string;
  readonly caption: string;
}

export function conflictCopy(
  by: string,
  savedAt: string,
  now: number,
  zone: string | null,
): ConflictCopy {
  return {
    title: `${by} changed this automation ${moment(savedAt, now, zone)}.`,
    caption: 'Your draft has changes too. Nothing is lost.',
  };
}

export interface CompareHeadInput {
  readonly base: number;
  readonly by: string;
  readonly theirs: number;
  readonly savedAt: string;
  readonly now: number;
  readonly zone: string | null;
}

export function compareHeads(input: CompareHeadInput): {
  readonly mine: string;
  readonly theirs: string;
} {
  const when = moment(input.savedAt, input.now, input.zone);
  return {
    mine: `Your draft, based on version ${String(input.base)}`,
    theirs: `${input.by}, version ${String(input.theirs)} ${when}`,
  };
}

export function compareCaption(theirs: number): string {
  return `Keeping your draft applies your changes on top of version ${String(theirs)} wherever they still fit, and lists the rest.`;
}

export function publishStatus(current: number, next: number): string {
  return `No errors. Version ${String(next)} replaces version ${String(current)}. It starts with the next trigger.`;
}

export function noteHeading(count: number): string {
  return count === 1 ? '1 thing to know' : `${String(count)} things to know`;
}

export function noteCounts(problems: readonly AutomationProgramProblem[]): number {
  return problems.filter((problem) => problem.severity !== 'error').length;
}

export function publishedMessage(revision: number): string {
  return `Live · revision ${String(revision)}`;
}

export function noticeText(notice: RebaseNotice): string {
  const kept = `${String(notice.kept)} of your changes now sit on top of the new version.`;
  if (notice.dropped.length === 0) return kept;
  const lost = notice.dropped.map((item) => `${item.summary} (${item.reason})`).join('; ');
  return `${kept} ${String(notice.dropped.length)} no longer fit: ${lost}.`;
}
