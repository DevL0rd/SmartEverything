import { readFileSync } from 'node:fs';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VACUUM_SCENE,
  type VacuumCleanSummary,
  type VacuumPose,
  type VacuumScene,
  type VacuumTrailRun,
} from '@smarteverything/domain';
import { duration } from '../../../../format/time';
import { deviceFixture } from '../../../../store/device-fixture';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface SentTrail {
  readonly base: readonly VacuumTrailRun[];
  readonly live: readonly VacuumTrailRun[];
}

interface Full {
  readonly trail: readonly VacuumTrailRun[];
  readonly mapIndex: number | null;
}

interface Probe {
  readonly seen: { readonly kind: string; readonly props: Props }[];
  readonly trails: SentTrail[];
  readonly poses: (VacuumPose | null)[];
  liveFeeds: number;
  full: Full | null;
}

const probe: Probe = vi.hoisted(() => ({
  seen: [],
  trails: [],
  poses: [],
  liveFeeds: 0,
  full: null,
}));

vi.mock('react-native', async () => {
  const { createElement: create, Fragment } = await import('react');
  return {
    View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
      create(Fragment, null, children),
    Platform: { OS: 'android' },
  };
});

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    probe.seen.push({ kind, props });
    return typeof props.children === 'string' ? null : (props.children ?? null);
  };
}

vi.mock('../../../home-map', async () => ({
  ...(await import('../../../home-map/components/stage/stage')),
  StageStillView: stub('StageStillView'),
}));
vi.mock('../../../home-map/components/stage/stage-chrome', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  StageTools: stub('StageTools'),
  StatusPill: stub('StatusPill'),
}));
vi.mock('../../../../components/house-map/live-visibility/stage-host', () => ({
  StageHost: stub('StageHost'),
}));
vi.mock('../../../../components/badge', () => ({ Badge: stub('Badge') }));
vi.mock('../../../../components/card', () => ({ Card: stub('Card') }));
vi.mock('../../../../components/empty-state', () => ({ EmptyState: stub('EmptyState') }));
vi.mock('../../../../components/error-state', () => ({ ErrorState: stub('ErrorState') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/skeleton', () => ({ Skeleton: stub('Skeleton') }));
vi.mock('../../../../components/slider', () => ({ Slider: stub('Slider') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../store/clock', () => ({ useMinute: (): number => Date.UTC(2026, 10, 7) }));
vi.mock('../data/cleans-query', () => ({
  useVacuumClean: (): { clean: Full | null; loading: boolean; failure: null } => ({
    clean: probe.full,
    loading: false,
    failure: null,
  }),
}));
vi.mock('uniwind', () => ({ useUniwind: (): { theme: string } => ({ theme: 'dark' }) }));
vi.mock('../../../../design/animation-gate', () => ({
  useScreenLive: (): { focused: boolean; foreground: boolean } => ({
    focused: true,
    foreground: true,
  }),
}));
vi.mock('../../../../design/motion', () => ({
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));
vi.mock('../../../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: true,
    onLayout: undefined,
  }),
}));
vi.mock('../../../device-visuals', () => ({ useVacuumFinish: (): string => 'default' }));
vi.mock('../data/use-live-trail', () => ({
  useLiveTrail: (): SentTrail => {
    probe.liveFeeds += 1;
    return { base: [], live: [] };
  },
}));
vi.mock('../data/use-vacuum-pose', () => ({
  useVacuumPose: (): { ok: true; value: null } => {
    probe.liveFeeds += 1;
    return { ok: true, value: null };
  },
}));
vi.mock('../../../../components/house-map/3d/map-3d', () => ({ default: stub('Map3d') }));
vi.mock('../../../../components/house-map/3d/map-3d-bridge', () => ({
  HandleSlot: class {
    current = null;
  },
  Map3dBridge: class {
    setScene(): void {
      probe.seen.push({ kind: 'setScene', props: {} });
    }

    setTrail(trail: SentTrail): void {
      probe.trails.push(trail);
    }

    setPose(pose: VacuumPose | null): void {
      probe.poses.push(pose);
    }
  },
}));

const { CleanReplay, cleanModeText, cleanScopeText, elapsedAt, outcomeLook, replayAt } =
  await import('./clean-replay');

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(new URL('../model/scene-geometry.fixture.json', import.meta.url), 'utf8'),
  ),
);

const RUNS: readonly VacuumTrailRun[] = [
  {
    mopping: false,
    points: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ],
  },
  {
    mopping: true,
    points: [
      { x: 4, y: 0 },
      { x: 4, y: 4 },
    ],
  },
];

const CLEAN: VacuumCleanSummary = {
  id: 'clean-1',
  startedAt: '2026-11-06T09:00:00.000Z',
  endedAt: '2026-11-06T09:40:00.000Z',
  seconds: 2400,
  areaM2: 30,
  scope: 'global',
  mode: 'sweep',
  rooms: [],
  outcome: 'finished',
  batteryStart: 100,
  batteryEnd: 70,
};

const device = deviceFixture(0, { kind: 'vacuum', name: 'Robot' });

let root: Root;

function render(shown: VacuumScene | null): void {
  act(() => {
    root.render(
      createElement(CleanReplay, {
        device,
        clean: CLEAN,
        scene: shown,
        onClose: (): void => undefined,
      }),
    );
  });
}

function last(kind: string): Props {
  const found = probe.seen.findLast((entry) => entry.kind === kind);
  if (found === undefined) throw new Error(`no ${kind} rendered`);
  return found.props;
}

function has(kind: string): boolean {
  return probe.seen.some((entry) => entry.kind === kind);
}

type Handler = (...args: readonly unknown[]) => unknown;

function isHandler(value: unknown): value is Handler {
  return typeof value === 'function';
}

function call(kind: string, prop: string, ...args: readonly unknown[]): void {
  const handler = last(kind)[prop];
  if (!isHandler(handler)) throw new Error(`${kind} has no ${prop}`);
  act(() => {
    handler(...args);
  });
}

function texts(): readonly unknown[] {
  return probe.seen.filter((entry) => entry.kind === 'Text').map((entry) => entry.props.children);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
  root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.unstubAllGlobals();
  probe.seen.length = 0;
  probe.trails.length = 0;
  probe.poses.length = 0;
  probe.liveFeeds = 0;
  probe.full = null;
});

describe('clean replay on the 3D stage', () => {
  it('opens the vacuum 3D view in Top with the whole path and the robot at its end', () => {
    probe.full = { trail: RUNS, mapIndex: scene.index };
    render(scene);
    expect(last('Map3d')).toMatchObject({ preset: 'top', follow: false, selection: [] });
    expect(String(last('Map3d')['label'])).toContain(`replay at ${duration(2400)}`);
    expect(probe.trails.at(-1)).toStrictEqual({ base: [], live: RUNS });
    expect(probe.poses.at(-1)).toStrictEqual({ x: 4, y: 4, yaw: Math.PI / 2 });
    expect(probe.liveFeeds).toBe(0);
    expect(has('StageStillView')).toBe(false);
  });

  it('puts the time scrubber in the notice slot with clock times and no stage tools', () => {
    probe.full = { trail: RUNS, mapIndex: scene.index };
    render(scene);
    expect(last('Slider')).toMatchObject({
      label: 'Replay position',
      value: 100,
      min: 0,
      max: 100,
    });
    expect(texts()).toEqual(expect.arrayContaining(['40:00']));
    expect(has('StageTools')).toBe(false);
    expect(has('Segmented')).toBe(false);
  });

  it('cuts the path and moves the robot as the scrubber moves', () => {
    probe.full = { trail: RUNS, mapIndex: scene.index };
    render(scene);
    call('Slider', 'onChange', 25);
    expect(probe.trails.at(-1)).toStrictEqual({
      base: [],
      live: [
        {
          mopping: false,
          points: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
          ],
        },
      ],
    });
    expect(probe.poses.at(-1)).toStrictEqual({ x: 2, y: 0, yaw: 0 });
    expect(String(last('Map3d')['label'])).toContain(`replay at ${duration(600)}`);
    expect(last('Slider')['value']).toBe(25);
    expect(texts()).toEqual(expect.arrayContaining(['10:00', '40:00']));
  });

  it('falls back to the still with the cut path when 3D fails', () => {
    probe.full = { trail: RUNS, mapIndex: scene.index };
    render(scene);
    call('Slider', 'onChange', 25);
    call('Map3d', 'onUnavailable', 'webgl', 'no context');
    const still = last('StageStillView');
    expect(still['state']).toStrictEqual({ unavailable: true });
    expect(JSON.stringify(still['input'])).toContain(
      '"trail":[{"mopping":false,"points":[{"x":0,"y":0},{"x":2,"y":0}]}]',
    );
  });

  it('says when the clean ran on an earlier map', () => {
    probe.full = { trail: RUNS, mapIndex: scene.index + 1 };
    render(scene);
    expect(texts()).toContain(
      'This clean used an earlier map, so the path is drawn on the current one.',
    );
  });

  it('shows a short state instead of the stage when there is no path or no map', () => {
    probe.full = { trail: [{ mopping: false, points: [{ x: 0, y: 0 }] }], mapIndex: null };
    render(scene);
    expect(last('EmptyState')['title']).toBe('No path was recorded');
    expect(has('Map3d')).toBe(false);
    probe.full = { trail: RUNS, mapIndex: null };
    render(null);
    expect(last('EmptyState')['title']).toBe('The map is not available');
    expect(has('Map3d')).toBe(false);
  });
});

describe('trail replay', () => {
  it('puts the robot on the start at zero and shows the whole path at one', () => {
    const start = replayAt(RUNS, 0);
    expect(start.runs[0]?.points).toStrictEqual([{ x: 0, y: 0 }]);
    expect(start.head).toStrictEqual({ x: 0, y: 0, yaw: 0 });
    expect(replayAt(RUNS, 1)).toStrictEqual({
      runs: RUNS,
      head: { x: 4, y: 4, yaw: Math.PI / 2 },
    });
  });

  it('cuts the path by length, interpolating inside a segment and keeping the run kind', () => {
    const quarter = replayAt(RUNS, 0.25);
    expect(quarter.runs).toHaveLength(1);
    expect(quarter.runs[0]?.points.at(-1)).toStrictEqual({ x: 2, y: 0 });
    const later = replayAt(RUNS, 0.75);
    expect(later.runs.map((run) => run.mopping)).toStrictEqual([false, true]);
    expect(later.runs[1]?.points.at(-1)).toStrictEqual({ x: 4, y: 2 });
    expect(later.head?.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('clamps the share and has no head for an empty trail', () => {
    expect(replayAt(RUNS, 5)).toStrictEqual(replayAt(RUNS, 1));
    expect(replayAt(RUNS, -1)).toStrictEqual(replayAt(RUNS, 0));
    expect(replayAt([], 0.5)).toStrictEqual({ runs: [], head: null });
  });

  it('turns the replay position into elapsed seconds of the clean', () => {
    expect(elapsedAt({ seconds: 2400 }, 50)).toBe(1200);
    expect(elapsedAt({ seconds: 2400 }, 150)).toBe(2400);
    expect(elapsedAt({ seconds: 2400 }, -5)).toBe(0);
  });
});

describe('clean wording', () => {
  it('names rooms, then the scope, and keeps unknown words as they are', () => {
    const rooms = [
      { id: 1, name: 'Kitchen' },
      { id: 2, name: 'Hall' },
      { id: 3, name: 'Study' },
    ];
    expect(cleanScopeText({ rooms, scope: 'rooms' })).toBe('Kitchen, Hall +1');
    expect(cleanScopeText({ rooms: [], scope: 'global' })).toBe('Whole home');
    expect(cleanScopeText({ rooms: [], scope: 'mystery' })).toBe('mystery');
    expect(cleanScopeText({ rooms: [], scope: null })).toBe('Clean');
  });

  it('maps outcomes and modes', () => {
    expect(outcomeLook('error')).toStrictEqual({ label: 'Error', tone: 'critical' });
    expect(outcomeLook('returned_low_battery').label).toBe('Low battery');
    expect(outcomeLook('odd')).toStrictEqual({ label: 'odd', tone: 'neutral' });
    expect(outcomeLook(null).label).toBe('Unknown');
    expect(cleanModeText('sweep_then_mop')).toBe('Vacuum, then mop');
    expect(cleanModeText(null)).toBeNull();
  });
});
