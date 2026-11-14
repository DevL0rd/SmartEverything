import type {
  DrivePlacement,
  DrivePlacementBasicLimits,
  DrivePlacementHold,
  DrivePlacementMode,
  DrivePlacementState,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { IconName } from '../../../components/icon';
import type { StatusTone, Tone } from '../../../components/tone';
import { bytes, percent } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';

export type PlacementTone = StatusTone | null;

export type PlacementUpgrade = 'winfsp' | 'fuse3' | null;

export interface PlacementChip {
  readonly label: string;
  readonly tone: BadgeTone;
}

export interface PlacementWords {
  readonly tone: PlacementTone;
  readonly chip: PlacementChip;
  readonly line: string;
  readonly notes: readonly string[];
  readonly upgrade: PlacementUpgrade;
  readonly held: boolean;
}

export const WINFSP_URL = 'https://winfsp.dev/rel/';

export const MODE_WORD: Readonly<Record<DrivePlacementMode, string>> = {
  synced: 'Sync',
  mounted: 'Mount',
};

export const MODE_ICON: Readonly<Record<DrivePlacementMode, IconName>> = {
  synced: 'folderSync',
  mounted: 'cloud',
};

export const ROUTE_WORD = { local: 'home network', remote: 'internet' } as const;

export const HOLD_REASONS: Readonly<Record<DrivePlacementHold, { chip: string; line: string }>> = {
  trashed: {
    chip: 'On hold: in the trash',
    line: 'The folder is in the trash. Restore it to carry on.',
  },
  no_access: {
    chip: 'On hold: no access',
    line: 'You can no longer open this folder. Ask its owner to share it again.',
  },
  sync_off: { chip: 'On hold: sync off', line: 'Sync is off for this folder.' },
};

const READ_ONLY_NOTE = 'Read only: you can view this folder, not change it';

interface StateLook {
  readonly tone: PlacementTone;
  readonly chip: string;
  readonly line: string;
}

export function syncedShareOf(needBytes: number, folderBytes: number | null): number | null {
  if (folderBytes === null || folderBytes === 0) return null;
  return Math.min(1, Math.max(0, 1 - needBytes / folderBytes));
}

export function basicLimitsOf(limits: DrivePlacementBasicLimits): string {
  return joinParts([
    'Basic',
    limits.maxFileBytes === null ? null : `${bytes(limits.maxFileBytes)} file limit`,
    limits.wholeFileOpen ? 'files open whole' : null,
    'not available offline',
  ]);
}

export function upgradeOf(limits: DrivePlacementBasicLimits | null): PlacementUpgrade {
  if (limits === null || limits.wholeFileOpen) return null;
  return limits.maxFileBytes === null ? 'fuse3' : 'winfsp';
}

function waitingOf(status: DrivePlacementStatus): string | null {
  return status.pendingUploads === 0 ? null : `${plural(status.pendingUploads, 'upload')} waiting`;
}

function mountedLine(status: DrivePlacementStatus): string {
  return joinParts([
    status.tier === 'basic' ? 'basic' : null,
    status.route === null ? 'ready' : `over the ${ROUTE_WORD[status.route]}`,
    status.openFiles === 0 ? null : `${plural(status.openFiles, 'file')} open`,
    waitingOf(status),
  ]);
}

function offlineLine(mode: DrivePlacementMode, status: DrivePlacementStatus): string {
  if (mode === 'synced') return waitingOf(status) ?? 'the local copy stays';
  if (status.pinnedBytes === 0) return 'nothing kept offline';
  return `${bytes(status.pinnedBytes)} kept offline`;
}

function syncingLook(status: DrivePlacementStatus, folderBytes: number | null): StateLook {
  const share = syncedShareOf(status.needBytes, folderBytes);
  const detail = joinParts([
    status.needBytes === 0 ? null : `${bytes(status.needBytes)} left`,
    waitingOf(status),
  ]);
  return {
    tone: 'info',
    chip: share === null ? 'Syncing' : `Syncing ${percent(share)}`,
    line: detail === '' ? 'comparing files' : detail,
  };
}

type StateLooks = Readonly<
  Record<DrivePlacementState, (placement: DrivePlacement, folderBytes: number | null) => StateLook>
>;

const STATE_LOOKS: StateLooks = {
  starting: () => ({ tone: 'info', chip: 'Starting', line: 'getting ready' }),
  mounted: ({ status }) => ({ tone: 'positive', chip: 'Mounted', line: mountedLine(status) }),
  syncing: ({ status }, folderBytes) => syncingLook(status, folderBytes),
  up_to_date: ({ status }) => ({
    tone: 'positive',
    chip: 'Up to date',
    line: waitingOf(status) ?? 'everything is here',
  }),
  offline: ({ mode, status }) => ({ tone: null, chip: 'Offline', line: offlineLine(mode, status) }),
  stopped: ({ status }) => ({ tone: null, chip: 'Stopped', line: status.reason ?? 'not running' }),
  failed: ({ status }) => ({
    tone: 'critical',
    chip: 'Failed',
    line: status.reason ?? 'no reason was given',
  }),
  blocked: ({ status }) => ({
    tone: 'warning',
    chip: 'Blocked',
    line: status.reason ?? 'no reason was given',
  }),
};

function stateLook(placement: DrivePlacement, folderBytes: number | null): StateLook {
  return STATE_LOOKS[placement.status.state](placement, folderBytes);
}

function notesOf(placement: DrivePlacement): readonly string[] {
  const { status } = placement;
  return [
    ...(status.basicLimits === null ? [] : [basicLimitsOf(status.basicLimits)]),
    ...(status.readOnly ? [READ_ONLY_NOTE] : []),
  ];
}

function chipToneOf(tone: PlacementTone): BadgeTone {
  return tone ?? 'neutral';
}

export function placementWordsOf(
  placement: DrivePlacement,
  folderBytes: number | null,
): PlacementWords {
  if (placement.hold !== null) {
    const hold = HOLD_REASONS[placement.hold];
    const chip = { label: hold.chip, tone: 'warning' } as const;
    return { tone: 'warning', chip, line: hold.line, notes: [], upgrade: null, held: true };
  }
  if (!placement.enabled) {
    const chip = { label: 'Paused', tone: 'neutral' } as const;
    return { tone: null, chip, line: 'resume to carry on', notes: [], upgrade: null, held: false };
  }
  const look = stateLook(placement, folderBytes);
  return {
    tone: look.tone,
    chip: { label: look.chip, tone: chipToneOf(look.tone) },
    line: look.line,
    notes: notesOf(placement),
    upgrade: upgradeOf(placement.status.basicLimits),
    held: false,
  };
}

export function sentenceOf(mode: DrivePlacementMode, words: PlacementWords): string {
  return words.held ? words.line : `${MODE_WORD[mode]} · ${words.line}`;
}

export function lineToneOf(words: PlacementWords): Tone {
  if (words.tone === 'critical') return 'critical';
  if (words.tone === 'warning') return 'warning';
  return 'variant';
}

export function needsAttention(placement: DrivePlacement): boolean {
  return placement.hold !== null || placement.status.state === 'failed';
}
