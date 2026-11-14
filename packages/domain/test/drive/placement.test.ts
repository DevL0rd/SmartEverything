import { describe, expect, it } from 'vitest';
import { DRIVE_PLACEMENT, DRIVE_PLACEMENT_SET } from '../../src/drive/placement';
import { COMPUTER_TOPICS, NODE_DEMAND, STATE_TOPICS } from '../../src/node/computer-live';
import { HUB_FRAME, NODE_FRAME } from '../../src/node/frames';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
const AT = '2026-11-07T10:00:00.000Z';

const STATUS = {
  state: 'mounted',
  tier: 'full',
  basicLimits: null,
  readOnly: true,
  route: 'local',
  cacheBytes: 10,
  pinnedBytes: 0,
  openFiles: 1,
  pendingUploads: 0,
  needBytes: 0,
  lastSyncedAt: null,
  errors: [],
  reason: null,
  reportedAt: AT,
} as const;

const PLACEMENT = {
  id: A,
  deviceId: B,
  rootId: C,
  folderItemId: D,
  mode: 'mounted',
  localPath: '/home/me/Games/Roms',
  enabled: true,
  hold: null,
  createdBy: B,
  createdAt: AT,
  status: STATUS,
} as const;

describe('drive placement', () => {
  it('parses a mounted placement of a folder', () => {
    expect(DRIVE_PLACEMENT.safeParse(PLACEMENT).success).toBe(true);
  });

  it('allows a whole-root placement with a null folder', () => {
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, folderItemId: null }).success).toBe(true);
  });

  const SYNCED = {
    ...PLACEMENT,
    mode: 'synced',
    excluded: ['Videos'],
    ignorePatterns: ['*.tmp'],
    conflictCopies: true,
  } as const;

  it('allows a synced placement of a whole drive or of one folder', () => {
    expect(DRIVE_PLACEMENT.safeParse({ ...SYNCED, folderItemId: null }).success).toBe(true);
    expect(DRIVE_PLACEMENT.safeParse(SYNCED).success).toBe(true);
  });

  it('carries the sync settings only on a synced placement', () => {
    const { excluded: _excluded, ...missing } = SYNCED;
    expect(DRIVE_PLACEMENT.safeParse(missing).success).toBe(false);
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, conflictCopies: true }).success).toBe(false);
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, excluded: [] }).success).toBe(false);
    expect(DRIVE_PLACEMENT.safeParse({ ...SYNCED, ignorePatterns: [''] }).success).toBe(false);
  });

  it('reports the sync numbers in the status and refuses a bad error entry', () => {
    const status = {
      ...STATUS,
      state: 'syncing',
      needBytes: 2048,
      lastSyncedAt: AT,
      errors: [{ relPath: 'a.txt', message: 'disk full', at: AT }],
    };
    expect(DRIVE_PLACEMENT.safeParse({ ...SYNCED, status }).success).toBe(true);
    expect(
      DRIVE_PLACEMENT.safeParse({ ...SYNCED, status: { ...status, needBytes: -1 } }).success,
    ).toBe(false);
    expect(
      DRIVE_PLACEMENT.safeParse({ ...SYNCED, status: { ...status, errors: [{ message: 'x' }] } })
        .success,
    ).toBe(false);
    const { needBytes: _need, ...without } = status;
    expect(DRIVE_PLACEMENT.safeParse({ ...SYNCED, status: without }).success).toBe(false);
  });

  it('requires the root and refuses unknown fields', () => {
    const { rootId: _rootId, ...withoutRoot } = PLACEMENT;
    expect(DRIVE_PLACEMENT.safeParse(withoutRoot).success).toBe(false);
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, extra: 1 }).success).toBe(false);
  });

  it('refuses unknown holds, states and a Basic limit claiming offline', () => {
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, hold: 'on_hold' }).success).toBe(false);
    expect(
      DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, status: { ...STATUS, state: 'gone' } }).success,
    ).toBe(false);
    const basic = {
      ...STATUS,
      tier: 'basic',
      basicLimits: { maxFileBytes: 5, wholeFileOpen: true, offline: true },
    };
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, status: basic }).success).toBe(false);
  });

  it('accepts Basic limits with no file limit', () => {
    const basic = {
      ...STATUS,
      tier: 'basic',
      basicLimits: { maxFileBytes: null, wholeFileOpen: true, offline: false },
    };
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, status: basic }).success).toBe(true);
  });
});

describe('setPlacement input', () => {
  const INPUT = {
    deviceId: B,
    rootId: C,
    folderItemId: D,
    mode: 'mounted',
    localPath: '/home/me/Roms',
    enabled: true,
  };

  it('parses and never carries hold or status', () => {
    expect(DRIVE_PLACEMENT_SET.safeParse(INPUT).success).toBe(true);
    expect(DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, hold: null }).success).toBe(false);
    expect(DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, status: STATUS }).success).toBe(false);
  });

  it('allows a synced folder with its sync settings and refuses synced without them', () => {
    const settings = { excluded: [], ignorePatterns: [], conflictCopies: false };
    expect(DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, mode: 'synced' }).success).toBe(false);
    expect(DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, mode: 'synced', ...settings }).success).toBe(
      true,
    );
    expect(
      DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, mode: 'synced', folderItemId: null, ...settings })
        .success,
    ).toBe(true);
    expect(DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, ...settings }).success).toBe(false);
  });
});

describe('placement frames', () => {
  it('parses the hub placements frame and refuses a bad row', () => {
    expect(HUB_FRAME.safeParse({ type: 'placements', placements: [PLACEMENT] }).success).toBe(true);
    expect(HUB_FRAME.safeParse({ type: 'placements', placements: [{ id: A }] }).success).toBe(
      false,
    );
  });

  it('parses the node placement_state frame', () => {
    const frame = { type: 'placement_state', placementId: A, ...STATUS };
    expect(NODE_FRAME.safeParse(frame).success).toBe(true);
    expect(NODE_FRAME.safeParse({ ...frame, state: 'gone' }).success).toBe(false);
  });

  it('refuses an unknown frame kind', () => {
    expect(HUB_FRAME.safeParse({ type: 'placement_unknown' }).success).toBe(false);
    expect(NODE_FRAME.safeParse({ type: 'placement_unknown' }).success).toBe(false);
  });
});

describe('drive_mounts topic', () => {
  it('is a state topic a node demand can ask for', () => {
    expect(STATE_TOPICS).toContain('drive_mounts');
    expect(COMPUTER_TOPICS).toContain('drive_mounts');
    expect(NODE_DEMAND.safeParse({ topics: { drive_mounts: 1 } }).success).toBe(true);
    expect(NODE_DEMAND.safeParse({ topics: { drive_other: 1 } }).success).toBe(false);
  });
});
