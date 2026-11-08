import {
  DEFAULT_COMPUTER_SCOPES,
  type DrivePlacement,
  type NodeFrame,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { ComputerCollector } from '../../src/node/collectors/collector';
import { ComputerNode } from '../../src/node/computer-node';
import { PlacementLink } from '../../src/node/placement-link';
import { localLinks } from '../support/local-links';
import { captureLogs, testLogger } from '../support/logs';
import { inertControls } from './controls/unused-controls';
import { CPU, SUMMARY } from './sample-parts';

const IDS = {
  placement: '11111111-1111-4111-8111-111111111111',
  device: '22222222-2222-4222-8222-222222222222',
  root: '33333333-3333-4333-8333-333333333333',
  person: '44444444-4444-4444-8444-444444444444',
} as const;

const STATUS = {
  state: 'starting',
  tier: null,
  basicLimits: null,
  readOnly: true,
  route: null,
  cacheBytes: 0,
  pinnedBytes: 0,
  openFiles: 0,
  pendingUploads: 0,
  reason: null,
  reportedAt: '2026-11-07T10:00:00.000Z',
} as const;

const PLACEMENT: DrivePlacement = {
  id: IDS.placement,
  deviceId: IDS.device,
  rootId: IDS.root,
  folderItemId: null,
  mode: 'mounted',
  localPath: '/home/ada/roms',
  enabled: true,
  hold: null,
  createdBy: IDS.person,
  createdAt: '2026-11-07T10:00:00.000Z',
  status: STATUS,
};

function idleCollector(): ComputerCollector {
  return {
    hello: () => Promise.reject(new Error('unused')),
    readers: {
      summary: () => SUMMARY,
      cpu: () => CPU,
      gpu: () => null,
      memory: () => null,
      disks: () => null,
      network: () => null,
      sensors: () => null,
      power: () => null,
    },
    track: () => undefined,
    stop: () => undefined,
  };
}

function link(): { readonly placements: PlacementLink; readonly sent: NodeFrame[] } {
  const sent: NodeFrame[] = [];
  return {
    placements: new PlacementLink((frame) => {
      sent.push(frame);
    }),
    sent,
  };
}

describe('PlacementLink', () => {
  it('hands each placements frame to the registered listener, replaced whole', () => {
    const { placements } = link();
    const seen: (readonly DrivePlacement[])[] = [];
    placements.onPlacements((list) => seen.push(list));
    expect(placements.handle({ type: 'placements', placements: [PLACEMENT] })).toBe(true);
    expect(placements.handle({ type: 'placements', placements: [] })).toBe(true);
    expect(seen).toEqual([[PLACEMENT], []]);
  });

  it('ignores frames of other types', () => {
    const { placements } = link();
    const seen: unknown[] = [];
    placements.onPlacements((list) => seen.push(list));
    expect(placements.handle({ type: 'scopes', scopes: DEFAULT_COMPUTER_SCOPES })).toBe(false);
    expect(seen).toEqual([]);
  });

  it('gives a late listener the placements already received', () => {
    const { placements } = link();
    placements.handle({ type: 'placements', placements: [PLACEMENT] });
    const seen: (readonly DrivePlacement[])[] = [];
    placements.onPlacements((list) => seen.push(list));
    expect(seen).toEqual([[PLACEMENT]]);
  });

  it('stops delivering to a listener that unsubscribed', () => {
    const { placements } = link();
    const seen: unknown[] = [];
    const stop = placements.onPlacements((list) => seen.push(list));
    stop();
    placements.handle({ type: 'placements', placements: [PLACEMENT] });
    expect(seen).toEqual([]);
  });

  it('sends placement_state with the reported fields', () => {
    const { placements, sent } = link();
    placements.report({ placementId: IDS.placement, ...STATUS, state: 'mounted', tier: 'full' });
    expect(sent).toEqual([
      {
        type: 'placement_state',
        placementId: IDS.placement,
        ...STATUS,
        state: 'mounted',
        tier: 'full',
      },
    ]);
  });

  it('tells when drive_mounts is demanded and only on a change', () => {
    const { placements } = link();
    const changes: boolean[] = [];
    placements.onMountsDemand((demanded) => changes.push(demanded));
    placements.handle({ type: 'demand', demand: { topics: { cpu: 1 } } });
    placements.handle({ type: 'demand', demand: { topics: { drive_mounts: 1 } } });
    placements.handle({ type: 'demand', demand: { topics: { drive_mounts: 2, cpu: 1 } } });
    expect(placements.mountsDemanded).toBe(true);
    placements.handle({ type: 'demand', demand: { topics: {} } });
    expect(placements.mountsDemanded).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('forgets placements and demand on stop', () => {
    const { placements } = link();
    const changes: boolean[] = [];
    placements.onMountsDemand((demanded) => changes.push(demanded));
    placements.handle({ type: 'placements', placements: [PLACEMENT] });
    placements.handle({ type: 'demand', demand: { topics: { drive_mounts: 1 } } });
    placements.stop();
    const seen: unknown[] = [];
    placements.onPlacements((list) => seen.push(list));
    expect(seen).toEqual([]);
    expect(changes).toEqual([true, false]);
  });
});

describe('ComputerNode placements', () => {
  it('routes placements and demand frames from the hub to its placement link', () => {
    captureLogs();
    const links = localLinks();
    const node = new ComputerNode({
      collector: idleCollector(),
      controls: inertControls(),
      link: links.node,
      now: (): Date => new Date('2026-11-07T10:00:00.000Z'),
      log: testLogger('node'),
    });
    const seen: (readonly DrivePlacement[])[] = [];
    node.placements.onPlacements((list) => seen.push(list));
    const sent: unknown[] = [];
    links.hub.onFrame((frame) => sent.push(frame));
    node.start();
    links.hub.send({ type: 'placements', placements: [PLACEMENT] });
    expect(seen).toEqual([[PLACEMENT]]);
    links.hub.send({ type: 'demand', demand: { topics: { drive_mounts: 1 } } });
    expect(node.placements.mountsDemanded).toBe(true);
    node.placements.report({ placementId: IDS.placement, ...STATUS });
    expect(sent).toContainEqual({ type: 'placement_state', placementId: IDS.placement, ...STATUS });
  });
});
