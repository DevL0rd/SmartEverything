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

  it('allows a synced placement of a whole root', () => {
    const synced = { ...PLACEMENT, mode: 'synced', folderItemId: null };
    expect(DRIVE_PLACEMENT.safeParse(synced).success).toBe(true);
  });

  it('refuses a synced placement with a folder', () => {
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, mode: 'synced' }).success).toBe(false);
  });

  it('requires the root and refuses unknown fields', () => {
    const { rootId: _rootId, ...withoutRoot } = PLACEMENT;
    expect(DRIVE_PLACEMENT.safeParse(withoutRoot).success).toBe(false);
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, extra: 1 }).success).toBe(false);
  });

  it('refuses unknown holds, states and a Basic limit claiming offline', () => {
    expect(DRIVE_PLACEMENT.safeParse({ ...PLACEMENT, hold: 'paused' }).success).toBe(false);
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

  it('refuses synced with a folder', () => {
    expect(DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, mode: 'synced' }).success).toBe(false);
    expect(
      DRIVE_PLACEMENT_SET.safeParse({ ...INPUT, mode: 'synced', folderItemId: null }).success,
    ).toBe(true);
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
