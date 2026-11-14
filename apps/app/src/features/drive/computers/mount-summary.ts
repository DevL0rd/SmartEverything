import type {
  DesktopDriveFuse,
  DesktopPlatform,
  DrivePlacement,
  DrivePlacementBasicLimits,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import type { ProgressStep } from '../../../components/progress-steps';
import { upgradeOf, type PlacementUpgrade } from './placement-words';

export type MountTier = NonNullable<DrivePlacementStatus['tier']>;

export interface MountSummary {
  readonly placements: readonly DrivePlacement[];
  readonly active: boolean;
  readonly tier: MountTier | null;
  readonly readOnly: boolean;
  readonly stopped: DrivePlacement | null;
  readonly cacheBytes: number;
  readonly pinnedBytes: number;
  readonly openFiles: number;
  readonly pendingUploads: number;
  readonly limits: DrivePlacementBasicLimits | null;
  readonly upgrade: PlacementUpgrade;
}

type Counted = 'cacheBytes' | 'pinnedBytes' | 'openFiles' | 'pendingUploads';

export const TIER_WORD: Readonly<Record<MountTier, string>> = {
  full: 'Full drive',
  basic: 'Basic',
};

function sum(placements: readonly DrivePlacement[], field: Counted): number {
  return placements.reduce((all, placement) => all + placement.status[field], 0);
}

function tierOf(active: readonly DrivePlacement[]): MountTier | null {
  const tiers = active.flatMap((placement) =>
    placement.status.tier === null ? [] : [placement.status.tier],
  );
  return tiers.includes('basic') ? 'basic' : (tiers[0] ?? null);
}

export function mountSummaryOf(
  deviceId: string,
  placements: readonly DrivePlacement[],
): MountSummary {
  const mounted = placements.filter(
    (placement) => placement.deviceId === deviceId && placement.mode === 'mounted',
  );
  const active = mounted.filter((placement) => placement.enabled && placement.hold === null);
  const limits = active.find((placement) => placement.status.basicLimits !== null);
  return {
    placements: mounted,
    active: active.length > 0,
    tier: tierOf(active),
    readOnly: active.some((placement) => placement.status.readOnly),
    stopped:
      active.find((placement) => ['failed', 'stopped'].includes(placement.status.state)) ?? null,
    cacheBytes: sum(active, 'cacheBytes'),
    pinnedBytes: sum(active, 'pinnedBytes'),
    openFiles: sum(active, 'openFiles'),
    pendingUploads: sum(active, 'pendingUploads'),
    limits: limits?.status.basicLimits ?? null,
    upgrade: upgradeOf(limits?.status.basicLimits ?? null),
  };
}

export type MountSetup = 'fuse3' | 'winfsp' | 'macos';

export function setupOf(
  platform: DesktopPlatform,
  fuse: DesktopDriveFuse | null,
  summary: MountSummary,
): MountSetup | null {
  if (platform === 'darwin') return 'macos';
  if (platform === 'linux' && fuse !== null && !fuse.available) return 'fuse3';
  return summary.upgrade;
}

export interface SetupCopy {
  readonly title: string;
  readonly intro: string;
  readonly steps: readonly ProgressStep[];
  readonly limits: string;
}

const SETUP: Readonly<Record<MountSetup, SetupCopy>> = {
  fuse3: {
    title: 'Full drive needs fuse3',
    intro: 'Synced folders work now. Install fuse3 once and mounted drives turn on by themselves.',
    steps: [
      { label: 'Synced folders are ready', state: 'done', detail: 'They keep a full copy here' },
      {
        label: 'Install fuse3',
        state: 'active',
        detail: 'Run it in a terminal yourself. SmartEverything never runs admin commands.',
      },
      {
        label: 'Mounts turn on by themselves',
        state: 'waiting',
        detail: 'The computer service looks for fuse3 every time it starts',
      },
    ],
    limits:
      'Without fuse3 there is no mounted drive on Linux: no files on demand and no offline pins.',
  },
  winfsp: {
    title: 'Full drive needs WinFsp',
    intro:
      'Basic already works in File Explorer. Install WinFsp and Full drive turns on by itself.',
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
    limits: 'Basic opens files whole, caps the size of one file and keeps nothing offline.',
  },
  macos: {
    title: 'Drive in Finder',
    intro: 'Synced folders work on this Mac. A mounted drive for macOS is planned.',
    steps: [
      { label: 'Synced folders are ready', state: 'done', detail: 'They keep a full copy here' },
      {
        label: 'Planned: mounted drive',
        state: 'waiting',
        detail: 'Opens files in place like on Linux and Windows. Nothing to install now.',
      },
    ],
    limits: 'No mounted drive on macOS yet: files are only here when their folder is synced.',
  },
};

export function setupCopyOf(setup: MountSetup): SetupCopy {
  return SETUP[setup];
}
