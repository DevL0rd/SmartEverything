import type {
  DesktopPlatform,
  DrivePlacement,
  DrivePlacementBasicLimits,
  DrivePlacementSet,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import type { MetricItem } from '../../../components/metric-strip';
import type { ProgressStep } from '../../../components/progress-steps';
import { bytes, count } from '../../../format/number';
import { plural } from '../../../format/text';
import { mountLineOf, type SyncLine } from '../computers/computers-model';
import { splitFigure } from '../roots/stat-strip';
import { upgradeOf, type PlacementUpgrade } from '../placements/placement-status';

export type MountTier = NonNullable<DrivePlacementStatus['tier']>;

export interface ThisMount {
  readonly placements: readonly DrivePlacement[];
  readonly enabled: boolean;
  readonly tier: MountTier | null;
  readonly readOnly: boolean;
  readonly line: SyncLine;
  readonly stopped: DrivePlacement | null;
  readonly cacheBytes: number;
  readonly pinnedBytes: number;
  readonly openFiles: number;
  readonly pendingUploads: number;
  readonly limits: DrivePlacementBasicLimits | null;
  readonly upgrade: PlacementUpgrade;
}

const TIER_WORD: Readonly<Record<MountTier, string>> = { full: 'Full drive', basic: 'Basic' };

const READ_ONLY_WORD = 'read only';

function sum(placements: readonly DrivePlacement[], field: keyof NumericStatus): number {
  return placements.reduce((all, placement) => all + placement.status[field], 0);
}

type NumericStatus = Pick<
  DrivePlacementStatus,
  'cacheBytes' | 'pinnedBytes' | 'openFiles' | 'pendingUploads'
>;

function isActive(placement: DrivePlacement): boolean {
  return placement.enabled && placement.hold === null;
}

function stoppedOf(active: readonly DrivePlacement[]): DrivePlacement | null {
  return (
    active.find(
      (placement) => placement.status.state === 'failed' || placement.status.state === 'stopped',
    ) ?? null
  );
}

function tierOf(active: readonly DrivePlacement[]): MountTier | null {
  const tiers = active.flatMap((placement) =>
    placement.status.tier === null ? [] : [placement.status.tier],
  );
  if (tiers.includes('basic')) return 'basic';
  return tiers[0] ?? null;
}

export function thisMountOf(deviceId: string, placements: readonly DrivePlacement[]): ThisMount {
  const mounted = placements.filter(
    (placement) => placement.deviceId === deviceId && placement.mode === 'mounted',
  );
  const active = mounted.filter(isActive);
  const limits = active.find((placement) => placement.status.basicLimits !== null);
  return {
    placements: mounted,
    enabled: active.length > 0,
    tier: tierOf(active),
    readOnly: active.some((placement) => placement.status.readOnly),
    line: mountLineOf(deviceId, placements),
    stopped: stoppedOf(active),
    cacheBytes: sum(active, 'cacheBytes'),
    pinnedBytes: sum(active, 'pinnedBytes'),
    openFiles: sum(active, 'openFiles'),
    pendingUploads: sum(active, 'pendingUploads'),
    limits: limits?.status.basicLimits ?? null,
    upgrade: upgradeOf(limits?.status.basicLimits ?? null),
  };
}

export function tierWordOf(tier: MountTier | null, readOnly: boolean): string | null {
  if (tier === null) return null;
  return tier === 'full' && readOnly ? `${TIER_WORD.full} · ${READ_ONLY_WORD}` : TIER_WORD[tier];
}

function cacheItem(mount: ThisMount): MetricItem {
  return {
    key: 'cache',
    label: 'Cache',
    ...splitFigure(bytes(mount.cacheBytes)),
    caption:
      mount.pinnedBytes === 0 ? 'Nothing kept offline' : `${bytes(mount.pinnedBytes)} kept offline`,
  };
}

function openItem(mount: ThisMount): MetricItem {
  return {
    key: 'open',
    label: 'Open now',
    value: count(mount.openFiles),
    unit: mount.openFiles === 1 ? 'file' : 'files',
  };
}

function writesItem(mount: ThisMount): MetricItem {
  if (mount.readOnly) {
    return {
      key: 'writes',
      label: 'Writes',
      value: 'Read only',
      tone: 'variant',
      caption: 'Save through Basic or the app',
    };
  }
  return {
    key: 'writes',
    label: 'Writes',
    value: count(mount.pendingUploads),
    caption: mount.pendingUploads === 0 ? 'Everything is on the hub' : 'Waiting to upload',
    ...(mount.pendingUploads === 0 ? {} : { tone: 'info' as const }),
  };
}

export function mountTilesOf(mount: ThisMount): readonly MetricItem[] {
  return [cacheItem(mount), openItem(mount), writesItem(mount)];
}

export function mountPointsLineOf(mount: ThisMount): string | null {
  const [only, second] = mount.placements;
  if (only === undefined) return null;
  return second === undefined
    ? `mounted at ${only.localPath}`
    : `${plural(mount.placements.length, 'folder')} mounted`;
}

export function toggleBodiesOf(
  placements: readonly DrivePlacement[],
  enabled: boolean,
): readonly DrivePlacementSet[] {
  return placements
    .filter((placement) => placement.hold === null && placement.enabled !== enabled)
    .map((placement) => ({
      deviceId: placement.deviceId,
      rootId: placement.rootId,
      folderItemId: placement.folderItemId,
      mode: placement.mode,
      localPath: placement.localPath,
      enabled,
    }));
}

export function repathBodyOf(placement: DrivePlacement, localPath: string): DrivePlacementSet {
  return {
    deviceId: placement.deviceId,
    rootId: placement.rootId,
    folderItemId: placement.folderItemId,
    mode: placement.mode,
    localPath,
    enabled: placement.enabled,
  };
}

export type MountSetup = 'fuse3' | 'winfsp' | 'macos';

export function setupOf(platform: DesktopPlatform, mount: ThisMount): MountSetup | null {
  if (platform === 'darwin') return 'macos';
  return mount.upgrade;
}

export interface SetupCopy {
  readonly title: string;
  readonly lede: string;
  readonly steps: readonly ProgressStep[];
}

const SETUP: Readonly<Record<MountSetup, SetupCopy>> = {
  fuse3: {
    title: 'Full drive needs fuse3',
    lede: 'Basic works now. Install fuse3 once and Full drive mounts by itself.',
    steps: [
      { label: 'Basic is ready', state: 'done', detail: 'Drive opens as a network place in Files' },
      {
        label: 'Install fuse3',
        state: 'active',
        detail: 'Run it in a terminal yourself. SmartEverything never runs admin commands.',
      },
      {
        label: 'Full drive turns on by itself',
        state: 'waiting',
        detail: 'The computer service looks for fuse3 every time it starts',
      },
    ],
  },
  winfsp: {
    title: 'Full drive needs WinFsp',
    lede: 'Basic already works in File Explorer. Install WinFsp and Full drive turns on by itself.',
    steps: [
      { label: 'Basic is ready', state: 'done', detail: 'Drive shows in File Explorer' },
      {
        label: 'Install WinFsp',
        state: 'active',
        detail: 'Get it from its official site. It needs your admin password once.',
      },
      {
        label: 'Full drive turns on by itself',
        state: 'waiting',
        detail: 'The computer service looks for WinFsp every time it starts',
      },
    ],
  },
  macos: {
    title: 'Drive in Finder',
    lede: 'Basic works in Finder today. A native drive for macOS is planned.',
    steps: [
      { label: 'Basic is ready', state: 'done', detail: 'Finder › Go › Connect to Server' },
      {
        label: 'Planned: native drive',
        state: 'waiting',
        detail: 'Opens files in place like on Linux and Windows. Nothing to install now.',
      },
      {
        label: 'Planned: offline folders',
        state: 'waiting',
        detail: 'Keep folders on this Mac for trips',
      },
    ],
  },
};

export function setupCopyOf(setup: MountSetup): SetupCopy {
  return SETUP[setup];
}
