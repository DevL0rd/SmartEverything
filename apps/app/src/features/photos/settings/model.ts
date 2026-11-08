import type { BackupSettings, BackupState } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import type { BadgeTone } from '../../../components/badge';
import type { BackupStatus } from '../backup/model/status';
import { PAUSE_LABELS } from '../backup/model/conditions';

export const PERSON_FOLDER_TEMPLATE = 'Photos';

function counted(value: number, one: string): string {
  return `${count(value)} ${value === 1 ? one : `${one}s`}`;
}

export interface PhoneBadge {
  readonly label: string;
  readonly tone: BadgeTone;
}

export function leftOf(state: BackupState): number {
  return state.pending + state.uploading + state.failed;
}

export function phoneBadge(state: BackupState): PhoneBadge {
  if (!state.device.settings.enabled) return { label: 'Off', tone: 'neutral' };
  const left = leftOf(state);
  if (left === 0) return { label: 'Up to date', tone: 'positive' };
  if (state.uploading > 0) return { label: `Backing up ${count(left)}`, tone: 'primary' };
  if (state.pending === 0) return { label: `${count(state.failed)} failed`, tone: 'critical' };
  return { label: `${count(left)} left`, tone: 'warning' };
}

export function phoneConditions(settings: BackupSettings, platform = 'android'): string {
  return joinParts([
    platform === 'desktop'
      ? settings.wifiOnly
        ? 'Unmetered networks only'
        : 'All networks'
      : settings.wifiOnly
        ? 'Wi-Fi only'
        : 'Wi-Fi and mobile data',
    settings.chargingOnly ? 'only while charging' : null,
    settings.includeVideos ? 'videos on' : 'photos only',
  ]);
}

export function folderOf(states: readonly BackupState[]): string {
  const first = states[0];
  return first === undefined ? PERSON_FOLDER_TEMPLATE : first.targetFolder;
}

export function summaryText(items: number | null, phones: number | null): string | null {
  const parts = [
    items === null ? null : counted(items, 'item'),
    phones === null ? null : counted(phones, 'phone'),
  ];
  return parts.every((part) => part === null) ? null : joinParts(parts);
}

const OFFLINE_CHANGES = 'Changing these settings needs your home hub.';

export function offlineText(phone: boolean): string {
  return phone
    ? `${OFFLINE_CHANGES} Backup on this phone keeps going and catches up when the hub is back.`
    : OFFLINE_CHANGES;
}

const PHASE_TEXT = {
  off: 'Off',
  unavailable: 'Update the app to turn on backup',
  denied: 'Needs access to your photos',
  scanning: 'Looking for new photos',
} as const satisfies Readonly<
  Record<Exclude<BackupStatus['phase'], 'paused' | 'uploading' | 'idle'>, string>
>;

export function thisPhoneText(status: BackupStatus): string {
  const { phase } = status;
  if (phase === 'paused') {
    return status.pauseReason === null ? 'Paused' : PAUSE_LABELS[status.pauseReason];
  }
  if (phase === 'uploading') return `Backing up ${count(status.total - status.done)}`;
  if (phase === 'idle') {
    return status.failed > 0 ? `${count(status.failed)} could not back up` : 'Up to date';
  }
  return PHASE_TEXT[phase];
}

export const ALL_PHONE_MEDIA = 'All photos and videos';

export function albumsText(albumIds: readonly string[]): string {
  return albumIds.length === 0 ? ALL_PHONE_MEDIA : counted(albumIds.length, 'album');
}

export function excludedText(
  excluded: readonly string[],
  albums: readonly { readonly id: string; readonly title: string }[],
): string {
  const names = albums.filter((album) => excluded.includes(album.id)).map((album) => album.title);
  return names.length === 0 ? 'None' : names.join(', ');
}
