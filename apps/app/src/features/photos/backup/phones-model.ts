import type { BackupSettings, BackupState, PhotosProgressNotice } from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import { count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { shortDate } from '../../../format/time';
import { phoneLeftOf } from '../components/photos-frame';
import { leftOf, phoneConditions } from '../settings/model';
import { PAUSE_LABELS } from './model/conditions';
import type { BackupStatus } from './model/status';

export interface Progress {
  readonly done: number;
  readonly total: number;
}

export type ProcessingKind = Exclude<PhotosProgressNotice['kind'], 'backup'>;

export interface LiveProgress {
  readonly devices: ReadonlyMap<string, Progress>;
  readonly kinds: ReadonlyMap<ProcessingKind, Progress>;
}

export const NO_PROGRESS: LiveProgress = { devices: new Map(), kinds: new Map() };

export function progressAfter(current: LiveProgress, notice: PhotosProgressNotice): LiveProgress {
  const progress = { done: notice.done, total: notice.total };
  if (notice.kind === 'backup') {
    if (notice.deviceId === undefined) return current;
    return { ...current, devices: new Map(current.devices).set(notice.deviceId, progress) };
  }
  if (notice.itemId !== undefined) return current;
  return { ...current, kinds: new Map(current.kinds).set(notice.kind, progress) };
}

export interface PhoneCounts {
  readonly backedUp: number;
  readonly left: number;
  readonly uploading: boolean;
  readonly failed: number;
}

export function countsOf(state: BackupState, live: Progress | undefined): PhoneCounts {
  if (live === undefined) {
    return {
      backedUp: state.backedUp,
      left: leftOf(state),
      uploading: state.uploading > 0,
      failed: state.failed,
    };
  }
  const left = live.total - live.done;
  return { backedUp: live.done, left, uploading: left > 0, failed: 0 };
}

export interface PhoneBadgeView {
  readonly label: string;
  readonly tone: BadgeTone;
}

export function badgeOf(enabled: boolean, counts: PhoneCounts): PhoneBadgeView {
  if (!enabled) return { label: 'Off', tone: 'neutral' };
  if (counts.left === 0) return { label: 'Up to date', tone: 'positive' };
  if (counts.uploading) return { label: `Backing up ${count(counts.left)}`, tone: 'primary' };
  if (counts.failed === counts.left) {
    return { label: `${count(counts.failed)} failed`, tone: 'critical' };
  }
  return { label: `${count(counts.left)} waiting`, tone: 'warning' };
}

const TONE_COLOUR: Readonly<Record<BadgeTone, ColourRole>> = {
  neutral: 'on-surface-faint',
  primary: 'primary',
  info: 'info',
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
};

export function coverageOf(counts: PhoneCounts): number {
  const total = counts.backedUp + counts.left;
  return total === 0 ? 1 : counts.backedUp / total;
}

export interface PhoneView {
  readonly key: string;
  readonly deviceId: string;
  readonly title: string;
  readonly person: string | null;
  readonly badge: PhoneBadgeView;
  readonly detail: string;
  readonly coverage: number;
  readonly colour: ColourRole;
}

function detailOf(state: BackupState, counts: PhoneCounts): string {
  const { settings } = state.device;
  if (counts.left > 0) {
    return joinParts([
      `${count(counts.backedUp)} of ${count(counts.backedUp + counts.left)}`,
      phoneConditions(settings, state.device.platform),
    ]);
  }
  return joinParts([
    `${count(counts.backedUp)} ${counts.backedUp === 1 ? 'item' : 'items'}`,
    state.lastBackupAt === null ? null : `last backup ${shortDate(state.lastBackupAt)}`,
  ]);
}

export function phoneViewOf(
  state: BackupState,
  live: Progress | undefined,
  person: string | null,
): PhoneView {
  const counts = countsOf(state, live);
  const badge = badgeOf(state.device.settings.enabled, counts);
  return {
    key: state.device.id,
    deviceId: state.device.deviceId,
    title: state.device.name,
    person,
    badge,
    detail: detailOf(state, counts),
    coverage: coverageOf(counts),
    colour: TONE_COLOUR[badge.tone],
  };
}

export function itemsLeftOf(states: readonly BackupState[], live: LiveProgress): number {
  return states
    .filter((state) => state.device.settings.enabled)
    .reduce((sum, state) => sum + countsOf(state, live.devices.get(state.device.deviceId)).left, 0);
}

export function backupSubtitleOf(
  states: readonly BackupState[] | undefined,
  live: LiveProgress,
): string {
  const kept = 'originals kept as they are';
  if (states === undefined || states.length === 0) return `Devices back up here · ${kept}`;
  const noun = states.some((state) => state.device.platform === 'desktop') ? 'device' : 'phone';
  const phones =
    states.length === 1
      ? `1 ${noun} backs up here`
      : `${count(states.length)} ${noun}s back up here`;
  const left = itemsLeftOf(states, live);
  return joinParts([phones, left === 0 ? 'up to date' : `${count(left)} items left`, kept]);
}

export type ChipMark = 'ring' | 'check' | 'pause';

export interface ChipView {
  readonly mark: ChipMark;
  readonly label: string;
  readonly progress: number;
}

export function hubChipOf(
  states: readonly BackupState[] | undefined,
  live: LiveProgress,
): ChipView | null {
  const phones = (states ?? []).filter((state) => state.device.settings.enabled);
  if (phones.length === 0) return null;
  const counts = phones.map((state) => countsOf(state, live.devices.get(state.device.deviceId)));
  const left = counts.reduce((sum, entry) => sum + entry.left, 0);
  if (left === 0) return { mark: 'check', label: 'Backed up', progress: 1 };
  const backedUp = counts.reduce((sum, entry) => sum + entry.backedUp, 0);
  const progress = backedUp / (backedUp + left);
  if (counts.some((entry) => entry.uploading)) {
    return { mark: 'ring', label: `Backing up ${count(left)}`, progress };
  }
  return { mark: 'pause', label: `${count(left)} waiting`, progress };
}

export function phoneProgressOf(status: BackupStatus): number {
  return status.total === 0 ? 1 : status.done / status.total;
}

function workingChip(status: BackupStatus): ChipView {
  const left = phoneLeftOf(status) ?? 0;
  const label = left === 0 ? 'Looking for new photos' : `Backing up ${count(left)}`;
  return { mark: 'ring', label, progress: phoneProgressOf(status) };
}

const PHONE_CHIP: Readonly<
  Record<BackupStatus['phase'], (status: BackupStatus) => ChipView | null>
> = {
  off: () => null,
  unavailable: () => null,
  denied: (status) => ({
    mark: 'pause',
    label: 'Photo access is off',
    progress: phoneProgressOf(status),
  }),
  paused: (status) => ({
    mark: 'pause',
    label: PAUSE_LABELS[status.pauseReason ?? 'user'],
    progress: phoneProgressOf(status),
  }),
  scanning: workingChip,
  uploading: workingChip,
  idle: (status) => {
    const left = phoneLeftOf(status) ?? 0;
    return left === 0
      ? { mark: 'check', label: 'Backed up', progress: 1 }
      : { mark: 'pause', label: `${count(left)} waiting`, progress: phoneProgressOf(status) };
  },
};

export function phoneChipOf(status: BackupStatus): ChipView | null {
  return PHONE_CHIP[status.phase](status);
}

export interface ConditionChip {
  readonly key: string;
  readonly icon: IconName;
  readonly label: string;
}

export function conditionChipsOf(
  settings: Pick<BackupSettings, 'wifiOnly' | 'chargingOnly' | 'includeVideos'>,
  desktop = false,
): readonly ConditionChip[] {
  return [
    {
      key: 'network',
      icon: 'wifi',
      label: desktop
        ? settings.wifiOnly
          ? 'Unmetered networks only'
          : 'All networks'
        : settings.wifiOnly
          ? 'Wi-Fi only'
          : 'Wi-Fi and mobile data',
    },
    {
      key: 'charging',
      icon: 'batteryCharging',
      label: settings.chargingOnly ? 'Only while charging' : 'Charging not needed',
    },
    { key: 'videos', icon: 'film', label: settings.includeVideos ? 'Videos on' : 'Photos only' },
  ];
}
