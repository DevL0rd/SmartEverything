import type { BackupState } from '@smarteverything/domain';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import type { ColourRole } from '../../../design/tokens';
import type { BackupStatus } from '../backup/model/status';
import { PAUSE_LABELS } from '../backup/model/conditions';
import { hubProgressOf, phoneProgressOf, type LiveProgress } from '../backup/phones-model';
import { phoneLeftOf } from '../components/photos-frame';

export const PERSON_FOLDER_TEMPLATE = 'Photos';

function counted(value: number, one: string): string {
  return `${count(value)} ${value === 1 ? one : `${one}s`}`;
}

export function folderOf(state: BackupState | undefined): string {
  return state?.targetFolder ?? PERSON_FOLDER_TEMPLATE;
}

export function summaryText(items: number | null, devices: number | null): string | null {
  const parts = [
    items === null ? null : counted(items, 'item'),
    devices === null ? null : `${counted(devices, 'device')} backing up`,
  ];
  return parts.every((part) => part === null) ? null : joinParts(parts);
}

const OFFLINE_CHANGES = 'Changing these settings needs your home hub.';

export function offlineText(local: boolean): string {
  return local
    ? `${OFFLINE_CHANGES} Backup on this device keeps going and catches up when the hub is back.`
    : OFFLINE_CHANGES;
}

export const ALL_PHONE_MEDIA = 'All photos and videos';

export function albumsText(albumIds: readonly string[]): string {
  return albumIds.length === 0 ? ALL_PHONE_MEDIA : counted(albumIds.length, 'album');
}

export function devicesLineOf(state: BackupState | undefined): string | null {
  if (state === undefined) return null;
  const on = state.devices.filter((entry) => entry.device.settings.enabled).length;
  return on === 0 ? 'No devices back up yet' : `${counted(on, 'device')} backing up`;
}

export interface BackupCardView {
  readonly headline: string | null;
  readonly detail: string | null;
  readonly progress: number | null;
  readonly colour: ColourRole;
}

const LOCAL_HEADLINE = {
  off: 'Backup is off',
  unavailable: 'Update the app to back up',
  denied: 'Needs access to your photos',
} as const;

function runningHeadlineOf(status: BackupStatus): string {
  const { phase } = status;
  const left = phoneLeftOf(status) ?? 0;
  if (phase === 'paused') {
    return `${PAUSE_LABELS[status.pauseReason ?? 'user']} · ${count(left)} left`;
  }
  if (phase === 'scanning' && left === 0) return 'Looking for new photos';
  if (left === 0) {
    return status.failed > 0 ? `${count(status.failed)} could not back up` : 'Up to date';
  }
  return `This device: ${count(left)} left`;
}

function localHeadlineOf(status: BackupStatus): string {
  const { phase } = status;
  if (phase === 'off' || phase === 'unavailable' || phase === 'denied') {
    return LOCAL_HEADLINE[phase];
  }
  return runningHeadlineOf(status);
}

function localColourOf(status: BackupStatus): ColourRole {
  if (status.phase === 'denied' || status.phase === 'paused') return 'warning';
  if (status.phase === 'idle' && phoneLeftOf(status) === 0) return 'positive';
  return 'primary';
}

export interface BackupCardInput {
  readonly status: BackupStatus | null;
  readonly state: BackupState | undefined;
  readonly live: LiveProgress;
}

export function backupCardOf({ status, state, live }: BackupCardInput): BackupCardView {
  const devices = devicesLineOf(state);
  if (status !== null) {
    const off = phoneLeftOf(status) === null;
    return {
      headline: localHeadlineOf(status),
      detail: devices,
      progress: off ? null : phoneProgressOf(status),
      colour: localColourOf(status),
    };
  }
  const hub = hubProgressOf(state, live);
  return {
    headline: devices,
    detail:
      hub === null ? null : hub.left === 0 ? 'Up to date' : `${count(hub.left)} left to back up`,
    progress: hub?.progress ?? null,
    colour: hub !== null && hub.left === 0 ? 'positive' : 'primary',
  };
}

export interface DuplicatesCardStats {
  readonly groups: number;
  readonly extraCopies: number;
  readonly bytesBack: number;
}

export interface DuplicatesCardView {
  readonly headline: string;
  readonly detail: string | null;
}

export function duplicatesCardOf(stats: DuplicatesCardStats): DuplicatesCardView {
  if (stats.groups === 0)
    return { headline: 'No duplicates', detail: 'Every photo is stored once' };
  return {
    headline: `${counted(stats.groups, 'group')} · ${bytes(stats.bytesBack)} to win back`,
    detail: `${count(stats.extraCopies)} ${stats.extraCopies === 1 ? 'extra copy' : 'extra copies'}`,
  };
}
