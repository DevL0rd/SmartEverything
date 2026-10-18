import './homelab-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WidgetFrameBox } from '../../components/widget-board';
import { snapshotFixture, statusFixture } from '../../plugins/adguard/model/snapshot-fixture';
import { routerSnapshot } from '../../plugins/router/overview/snapshot-fixture';
import { folderOf, snapshotOf } from '../../plugins/syncthing/model/snapshot-fixture';
import { mountFace, useCellEnvironment, type Face } from './cell-budget';
import { adguardFace, routerFace, syncthingFace } from './homelab-faces';

const gate = vi.hoisted(() => ({ live: true }));
const hold = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>());
const history = vi.hoisted(() => vi.fn<(...args: unknown[]) => void>());

vi.mock('../../design/use-visible-live', () => ({
  useVisibleLive: (): { readonly live: boolean; readonly onLayout: undefined } => ({
    live: gate.live,
    onLayout: undefined,
  }),
}));

vi.mock('../../plugins/shared/use-source-live', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useSourceLive: hold,
}));

vi.mock('../../queries/history', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDeviceSeries: (...args: unknown[]): { data: undefined } => {
    history(...args);
    return { data: undefined };
  },
}));

const FRAMES: Readonly<Record<string, WidgetFrameBox>> = {
  xs: { width: 144, height: 100, idiom: 'touch' },
  s: { width: 144, height: 190, idiom: 'touch' },
  m: { width: 300, height: 150, idiom: 'touch' },
  w: { width: 600, height: 150, idiom: 'touch' },
  l: { width: 300, height: 260, idiom: 'touch' },
  xl: { width: 600, height: 260, idiom: 'touch' },
};

const WIDE = ['m', 'w', 'l', 'xl'] as const;
const NARROW = ['xs', 's'] as const;

const KINDS = [
  { name: 'router', face: (): Face => routerFace(routerSnapshot(), true), label: 'Router, online' },
  {
    name: 'adguard',
    face: (): Face => adguardFace(snapshotFixture(), true),
    label: 'AdGuard Home, protecting',
  },
  {
    name: 'syncthing',
    face: (): Face => syncthingFace(snapshotOf(), true),
    label: 'Syncthing, up to date',
  },
] as const;

function frameOf(cls: string): WidgetFrameBox {
  const frame = FRAMES[cls];
  if (frame === undefined) throw new Error(`Expected a frame for ${cls}`);
  return frame;
}

function treeAt(face: Face, cls: string): string {
  const mounted = mountFace(face, frameOf(cls));
  const tree = mounted.tree();
  mounted.unmount();
  return tree;
}

describe('homelab cells', () => {
  useCellEnvironment();

  beforeEach(() => {
    gate.live = true;
    hold.mockReset();
    history.mockReset();
  });

  afterEach(() => {
    gate.live = true;
  });

  describe.each(KINDS)('$name', ({ face, label }) => {
    it.each(WIDE)('draws the wide card at class %s', (cls) => {
      expect(treeAt(face(), cls)).toContain(label);
    });

    it.each(NARROW)('keeps today’s compact face at class %s', (cls) => {
      expect(treeAt(face(), cls)).not.toContain(label);
    });

    it('holds the live feed only while the cell is visible', () => {
      treeAt(face(), 'm');
      expect(hold).toHaveBeenCalledTimes(1);
      hold.mockClear();
      gate.live = false;
      treeAt(face(), 'm');
      expect(hold).not.toHaveBeenCalled();
    });

    it('does not hold the live feed on the compact faces', () => {
      treeAt(face(), 's');
      expect(hold).not.toHaveBeenCalled();
    });
  });

  it('reads stored history only while the router cell is visible', () => {
    treeAt(routerFace(routerSnapshot(), true), 'w');
    expect(history.mock.calls.length).toBeGreaterThan(0);
    expect(history.mock.calls.every((call) => call[3] === true)).toBe(true);
    history.mockClear();
    gate.live = false;
    treeAt(routerFace(routerSnapshot(), true), 'w');
    expect(history.mock.calls.length).toBeGreaterThan(0);
    expect(history.mock.calls.every((call) => call[3] === false)).toBe(true);
  });

  describe('states', () => {
    it('router: offline when unreachable, with the reason and no actions', () => {
      const since = '2026-10-16T07:55:00.000+00:00';
      const tree = treeAt(
        routerFace(routerSnapshot({ state: 'unreachable', reason: 'timeout', since }), true),
        'w',
      );
      expect(tree).toContain('Router, not reachable');
      expect(tree).not.toContain('accessibilityLabel="Speed test"');
    });

    it('router: a member cannot restart Wi-Fi, an owner can at the wide size', () => {
      expect(treeAt(routerFace(routerSnapshot(), false), 'w')).not.toContain('Restart Wi-Fi');
      expect(treeAt(routerFace(routerSnapshot(), true), 'w')).toContain('Restart Wi-Fi');
    });

    it('router: offers only Restart Wi-Fi when the internet is down', () => {
      const down = routerSnapshot(
        { state: 'online' },
        { network: { ...routerSnapshot().network!, wanUp: false } },
      );
      const tree = treeAt(routerFace(down, true), 'm');
      expect(tree).toContain('Router, no internet');
      expect(tree).toContain('Restart Wi-Fi');
      expect(tree).not.toContain('accessibilityLabel="Speed test"');
    });

    it('router: says how to connect it when it is not set up yet', () => {
      const tree = treeAt(routerFace(routerSnapshot({ state: 'not_set_up' }), true), 'm');
      expect(tree).toContain('Router, Connect it to see it here');
    });

    it('adguard: says when it resumes while paused and offers Resume', () => {
      const paused = snapshotFixture({
        status: statusFixture({ protection: false, pausedUntil: '2026-10-16T09:30:00.000Z' }),
      });
      const tree = treeAt(adguardFace(paused, true), 'm');
      expect(tree).toContain('AdGuard Home, paused, Paused · resumes');
      expect(tree).toContain('accessibilityLabel="Resume"');
    });

    it('adguard: says blocking is off and offers Turn on', () => {
      const off = snapshotFixture({ status: statusFixture({ protection: false }) });
      const tree = treeAt(adguardFace(off, true), 'm');
      expect(tree).toContain('Ad blocking is off');
      expect(tree).toContain('accessibilityLabel="Turn on"');
    });

    it('adguard: offers the pause menu to the owner only', () => {
      expect(treeAt(adguardFace(snapshotFixture(), true), 'm')).toContain(
        'accessibilityLabel="Pause"',
      );
      expect(treeAt(adguardFace(snapshotFixture(), false), 'm')).not.toContain(
        'accessibilityLabel="Pause"',
      );
    });

    it('syncthing: offers Resume while paused and Pause otherwise', () => {
      const paused = snapshotOf({
        summary: { ...snapshotOf().summary, state: 'paused' },
      });
      expect(treeAt(syncthingFace(paused, true), 'm')).toContain('accessibilityLabel="Resume"');
      expect(treeAt(syncthingFace(snapshotOf(), true), 'm')).toContain(
        'accessibilityLabel="Pause"',
      );
    });

    it('syncthing: a failed folder replaces Rescan with a way to the conflict', () => {
      const broken = snapshotOf({
        summary: { ...snapshotOf().summary, state: 'error' },
        folders: [folderOf({ id: 'docs', label: 'Docs', errorCount: 1 })],
      });
      const tree = treeAt(syncthingFace(broken, true), 'm');
      expect(tree).toContain('Syncthing, 1 conflict');
      expect(tree).not.toContain('accessibilityLabel="Rescan"');
      expect(treeAt(syncthingFace(snapshotOf(), true), 'm')).toContain(
        'accessibilityLabel="Rescan"',
      );
    });

    it('syncthing: stops offering actions when the connection is lost', () => {
      const lost = snapshotOf({
        connection: {
          state: 'unreachable',
          reason: 'timeout',
          since: '2026-10-16T07:55:00.000+00:00',
        },
      });
      const tree = treeAt(syncthingFace(lost, true), 'm');
      expect(tree).toContain('Syncthing, not reachable');
      expect(tree).not.toContain('accessibilityLabel="Pause"');
    });
  });
});
