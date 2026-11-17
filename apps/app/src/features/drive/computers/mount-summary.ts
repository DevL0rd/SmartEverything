import type {
  DesktopDriveFuse,
  DesktopPlatform,
  DrivePlacement,
  DrivePlacementBasicLimits,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import type { BadgeTone } from '../../../components/badge';
import type { IconName } from '../../../components/icon';
import type { ProgressStep } from '../../../components/progress-steps';
import { bytes } from '../../../format/number';
import { plural } from '../../../format/text';
import { upgradeOf, type PlacementUpgrade } from './placement-words';

export type MountTier = NonNullable<DrivePlacementStatus['tier']>;

export type MountRoute = NonNullable<DrivePlacementStatus['route']>;

export type MountHealth = 'ready' | 'starting' | 'offline' | 'blocked' | 'stopped' | 'off';

export interface MountSummary {
  readonly placements: readonly DrivePlacement[];
  readonly active: boolean;
  readonly health: MountHealth;
  readonly tier: MountTier | null;
  readonly route: MountRoute | null;
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

export interface MountLook {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

export const HEALTH_LOOK: Readonly<Record<MountHealth, MountLook>> = {
  ready: { label: 'Mounted', tone: 'positive', icon: 'circleCheck' },
  starting: { label: 'Starting', tone: 'info', icon: 'loader' },
  offline: { label: 'Hub out of reach', tone: 'warning', icon: 'cloudOff' },
  blocked: { label: 'Blocked', tone: 'warning', icon: 'warning' },
  stopped: { label: 'Stopped', tone: 'critical', icon: 'warning' },
  off: { label: 'Paused', tone: 'neutral', icon: 'pause' },
};

export const ROUTE_LOOK: Readonly<Record<MountRoute, MountLook>> = {
  local: { label: 'Home network', tone: 'neutral', icon: 'house' },
  remote: { label: 'Internet', tone: 'neutral', icon: 'globe' },
};

const HEALTH_ORDER: readonly (readonly [MountHealth, readonly DrivePlacementStatus['state'][]])[] =
  [
    ['stopped', ['failed', 'stopped']],
    ['blocked', ['blocked']],
    ['offline', ['offline']],
    ['starting', ['starting']],
  ];

function healthOf(active: readonly DrivePlacement[]): MountHealth {
  if (active.length === 0) return 'off';
  const states = new Set(active.map((placement) => placement.status.state));
  const found = HEALTH_ORDER.find(([, matches]) => matches.some((state) => states.has(state)));
  return found?.[0] ?? 'ready';
}

function routeOf(active: readonly DrivePlacement[]): MountRoute | null {
  const routes = active.flatMap((placement) =>
    placement.status.route === null ? [] : [placement.status.route],
  );
  return routes.includes('remote') ? 'remote' : (routes[0] ?? null);
}

const OPENABLE_STATES: ReadonlySet<DrivePlacementStatus['state']> = new Set(['mounted', 'offline']);

export function mountOpenable(placement: DrivePlacement): boolean {
  return (
    placement.mode === 'mounted' &&
    placement.status.mountPoint !== null &&
    placement.enabled &&
    placement.hold === null &&
    OPENABLE_STATES.has(placement.status.state)
  );
}

const UPLOAD_WAIT: Readonly<Record<MountHealth, string>> = {
  ready: 'Uploading now',
  starting: 'Uploads once the mount is up',
  offline: 'Uploads when the Hub is back',
  blocked: 'Uploads once the mount runs again',
  stopped: 'Uploads once the mount runs again',
  off: 'Uploads once the mount is resumed',
};

export function uploadWaitOf(health: MountHealth): string {
  return UPLOAD_WAIT[health];
}

export function offlineBodyOf(summary: MountSummary): string {
  const reads =
    summary.pinnedBytes === 0
      ? 'Files already cached still open.'
      : `${bytes(summary.pinnedBytes)} kept offline still opens.`;
  const writes =
    summary.pendingUploads === 0
      ? 'Changes wait on this computer and upload when the Hub is back.'
      : `${plural(summary.pendingUploads, 'change')} ${summary.pendingUploads === 1 ? 'waits' : 'wait'} to upload when the Hub is back.`;
  return `${reads} ${writes}`;
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
    health: healthOf(active),
    tier: tierOf(active),
    route: routeOf(active),
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
  const fullMount = summary.active && summary.tier === 'full';
  if (fullMount && summary.health === 'ready') return null;
  if (platform === 'darwin') return fullMount ? null : 'macos';
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
