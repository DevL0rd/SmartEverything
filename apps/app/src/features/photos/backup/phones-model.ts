import type {
  BackupDeviceState,
  BackupSettings,
  BackupState,
  PhotosProgressNotice,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { IconName } from '../../../components/icon';
import type { ColourRole } from '../../../design/tokens';
import { count, percent } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { shortDate } from '../../../format/time';
import { phoneLeftOf } from '../components/photos-frame';
import { PAUSE_LABELS, type PauseReason } from './model/conditions';
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

export function leftOf(state: BackupDeviceState): number {
  return state.pending + state.uploading + state.failed;
}

export function networkLabelOf(wifiOnly: boolean, desktop: boolean): string {
  if (desktop) return wifiOnly ? 'Unmetered networks only' : 'All networks';
  return wifiOnly ? 'Wi-Fi only' : 'Wi-Fi and mobile data';
}

export function phoneConditions(settings: BackupSettings, platform = 'android'): string {
  return joinParts([
    networkLabelOf(settings.wifiOnly, platform === 'desktop'),
    settings.chargingOnly ? 'only while charging' : null,
    settings.includeVideos ? 'videos on' : 'photos only',
  ]);
}

export interface PhoneCounts {
  readonly backedUp: number;
  readonly left: number;
  readonly uploading: boolean;
  readonly failed: number;
}

export function countsOf(state: BackupDeviceState, live: Progress | undefined): PhoneCounts {
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
  readonly current: boolean;
  readonly platform: BackupDeviceState['device']['platform'];
  readonly badge: PhoneBadgeView;
  readonly detail: string;
  readonly coverage: number;
  readonly share: string;
  readonly colour: ColourRole;
}

function detailOf(state: BackupDeviceState, counts: PhoneCounts): string {
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

export interface PhoneViewInput {
  readonly live: Progress | undefined;
  readonly current: boolean;
}

export function phoneViewOf(state: BackupDeviceState, input: PhoneViewInput): PhoneView {
  const { live, current } = input;
  const counts = countsOf(state, live);
  const badge = badgeOf(state.device.settings.enabled, counts);
  return {
    key: state.device.id,
    deviceId: state.device.deviceId,
    title: state.device.name,
    current,
    platform: state.device.platform,
    badge,
    detail: detailOf(state, counts),
    coverage: coverageOf(counts),
    share: percent(Math.floor(coverageOf(counts) * 100) / 100),
    colour: TONE_COLOUR[badge.tone],
  };
}

export function currentFirst<T extends { readonly current: boolean }>(
  views: readonly T[],
): readonly T[] {
  return [...views.filter((view) => view.current), ...views.filter((view) => !view.current)];
}

export function itemsLeftOf(states: readonly BackupDeviceState[], live: LiveProgress): number {
  return states
    .filter((state) => state.device.settings.enabled)
    .reduce((sum, state) => sum + countsOf(state, live.devices.get(state.device.deviceId)).left, 0);
}

export function backupSubtitleOf(state: BackupState | undefined, live: LiveProgress): string {
  const states = state?.devices;
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

export interface HubProgress {
  readonly left: number;
  readonly progress: number;
  readonly uploading: boolean;
}

export function hubProgressOf(
  state: BackupState | undefined,
  live: LiveProgress,
): HubProgress | null {
  const phones = (state?.devices ?? []).filter((entry) => entry.device.settings.enabled);
  if (phones.length === 0) return null;
  const counts = phones.map((entry) => countsOf(entry, live.devices.get(entry.device.deviceId)));
  const left = counts.reduce((sum, entry) => sum + entry.left, 0);
  const backedUp = counts.reduce((sum, entry) => sum + entry.backedUp, 0);
  return {
    left,
    progress: backedUp + left === 0 ? 1 : backedUp / (backedUp + left),
    uploading: counts.some((entry) => entry.uploading),
  };
}

export function hubChipOf(state: BackupState | undefined, live: LiveProgress): ChipView | null {
  const hub = hubProgressOf(state, live);
  if (hub === null) return null;
  if (hub.left === 0) return { mark: 'check', label: 'Backed up', progress: 1 };
  if (hub.uploading) {
    return { mark: 'ring', label: `Backing up ${count(hub.left)}`, progress: hub.progress };
  }
  return { mark: 'pause', label: `${count(hub.left)} waiting`, progress: hub.progress };
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
  readonly blocking: boolean;
}

const BLOCKS: Readonly<Record<string, readonly PauseReason[]>> = {
  network: ['wifi', 'offline'],
  charging: ['charging'],
  videos: [],
};

export function conditionChipsOf(
  settings: Pick<BackupSettings, 'wifiOnly' | 'chargingOnly' | 'includeVideos'>,
  desktop: boolean,
  reason: PauseReason | null,
): readonly ConditionChip[] {
  const chips = [
    { key: 'network', icon: 'wifi', label: networkLabelOf(settings.wifiOnly, desktop) },
    {
      key: 'charging',
      icon: 'batteryCharging',
      label: settings.chargingOnly ? 'Only while charging' : 'Charging not needed',
    },
    { key: 'videos', icon: 'film', label: settings.includeVideos ? 'Videos on' : 'Photos only' },
  ] as const;
  return chips.map((chip) => ({
    ...chip,
    blocking: reason !== null && (BLOCKS[chip.key] ?? []).includes(reason),
  }));
}
