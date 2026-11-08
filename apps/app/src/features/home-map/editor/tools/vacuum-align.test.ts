import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HOME_MAP_SOURCE, HOME_MAP_WRITE, type HomeMap } from '@smarteverything/domain';
import { EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';
import type { AlignDraft, RobotCandidate, VacuumAlign } from './vacuum-align';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());
const store = vi.hoisted(() => ({ devices: new Array<RobotCandidate>() }));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: (): void => undefined }));
vi.mock('../../../../queries/use-screen-query', () => ({
  useScreenQuery: (): object => ({ data: undefined }),
}));
vi.mock('../../../../store/selectors', () => ({
  useDevices: (): RobotCandidate[] => store.devices,
}));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: (): object => ({}) }));
vi.mock('../../data/home-map-query', () => ({
  homeMapQueryKey: (): readonly string[] => ['map'],
  refetchHomeMap: (): Promise<void> => Promise.resolve(),
}));

const {
  EMPTY_ALIGN,
  VacuumAlignPanel,
  alignPoints,
  alignPrompt,
  alignTap,
  alignTarget,
  chosenRobot,
  ringsBounds,
  stepStates,
  vacuumRobots,
} = await import('./vacuum-align');
const { alignEdit, alignNotice, alignOverlay, ghostTransform, houseToRobot } =
  await import('./align-mount');

const FLOOR_ID = '00000000-0000-4000-8000-0000000000f1';
const ROBOT_ID = '00000000-0000-4000-8000-0000000000d1';

const SOURCE = HOME_MAP_SOURCE.parse({
  id: 'source-1',
  kind: 'xiaomi_vacuum',
  deviceId: ROBOT_ID,
  floorId: FLOOR_ID,
  transform: { rotationDeg: 0, tx: 0, ty: 0, mirrored: false },
  frame: { uid: null, name: null, boundsSignature: '0,0,1,1' },
  lastVersion: null,
  lastImportedAt: null,
  base: { rooms: [], walls: [], openings: [] },
  tombstones: [],
});

function mapWith(sources: readonly object[]): HomeMap {
  return HOME_MAP_WRITE.parse({
    schemaVersion: 1,
    id: 'home',
    name: 'Test house',
    revision: 1,
    updatedAt: '2026-10-25T00:00:00.000Z',
    north: 0,
    floors: [
      {
        id: FLOOR_ID,
        name: 'Ground',
        level: 0,
        elevation: 0,
        ceilingHeight: 2.6,
        rooms: [],
        walls: [],
        openings: [],
        objects: [],
        placements: [],
        annotations: [],
      },
    ],
    sources,
    notices: [],
  });
}

function robot(id: string, name: string, provider = 'xiaomi', kind = 'vacuum'): RobotCandidate {
  return { id, name, provider, kind };
}

const ROBOT = [
  [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 2 },
    { x: 0, y: 2 },
  ],
];

interface AlignOptions {
  readonly map: HomeMap;
  readonly readOnly?: boolean;
  readonly draft?: AlignDraft;
  readonly drafts?: AlignDraft[];
}

function alignOf(options: AlignOptions): VacuumAlign {
  const { map } = options;
  const deviceId = chosenRobot(null, map, store.devices);
  return {
    map,
    mapId: undefined,
    floorId: FLOOR_ID,
    readOnly: options.readOnly ?? false,
    robots: vacuumRobots(store.devices),
    deviceId,
    choose: vi.fn(),
    source: map.sources.find((entry) => entry.deviceId === deviceId) ?? null,
    robot: ROBOT,
    draft: options.draft ?? EMPTY_ALIGN,
    setDraft: (draft): void => {
      options.drafts?.push(draft);
    },
  };
}

function render(map: HomeMap, readOnly = false, draft: AlignDraft = EMPTY_ALIGN): Seen[] {
  seen.length = 0;
  renderToStaticMarkup(
    createElement(VacuumAlignPanel, { align: alignOf({ map, readOnly, draft }) }),
  );
  return [...seen];
}

const tap = (x: number, y: number) =>
  ({
    type: 'tap',
    seq: 1,
    point: { x, y },
    floorId: FLOOR_ID,
    hit: { kind: 'none' },
    metresPerPx: 0.01,
  }) as const;

const labels = (items: readonly Seen[], kind: string): unknown[] =>
  items
    .filter((item) => item.kind === kind)
    .map((item) => item.props[kind === 'View' ? 'accessibilityLabel' : 'label']);

describe('two-point align draft', () => {
  it('takes robot then house for point 1, then robot then house for point 2', () => {
    expect(alignTarget(EMPTY_ALIGN)).toEqual({ pair: 0, side: 'source' });
    const ignored = alignTap(EMPTY_ALIGN, 'house', { x: 9, y: 9 });
    expect(ignored).toBe(EMPTY_ALIGN);
    const one = alignTap(EMPTY_ALIGN, 'source', { x: 1, y: 1 });
    expect(alignPrompt(one)).toBe('Tap the same spot as point 1 on the floor');
    const two = alignTap(one, 'house', { x: 2, y: 2 });
    expect(alignPrompt(two)).toBe('Tap point 2 on the blue robot map');
    expect(stepStates(two)).toEqual(['done', 'done', 'active', 'waiting']);
    expect(alignPoints(two)).toBeNull();
    const done = alignTap(alignTap(two, 'source', { x: 5, y: 1 }), 'house', { x: 2, y: 6 });
    expect(alignTarget(done)).toBeNull();
    expect(alignPoints(done)).toEqual([
      { source: { x: 1, y: 1 }, house: { x: 2, y: 2 } },
      { source: { x: 5, y: 1 }, house: { x: 2, y: 6 } },
    ]);
  });

  it('bounds the drawn rings and has none for an empty map', () => {
    expect(ringsBounds([])).toBeNull();
    expect(
      ringsBounds([
        [
          { x: 1, y: 2 },
          { x: 4, y: -1 },
        ],
      ]),
    ).toEqual({ minX: 1, minY: -1, maxX: 4, maxY: 2 });
  });
});

describe('robot choice', () => {
  it('lists only Xiaomi vacuums by name', () => {
    const found = vacuumRobots([
      robot('b', 'Upstairs'),
      robot('a', 'Downstairs'),
      robot('c', 'Lamp', 'xiaomi', 'light'),
      robot('d', 'Other robot', 'tuya'),
    ]);
    expect(found.map((device) => device.id)).toEqual(['a', 'b']);
  });

  it('prefers the pick, then the imported robot, then the first robot', () => {
    const map = mapWith([SOURCE]);
    expect(chosenRobot('x', map, [{ id: 'y' }])).toBe('x');
    expect(chosenRobot(null, map, [{ id: 'y' }])).toBe(ROBOT_ID);
    expect(chosenRobot(null, mapWith([]), [{ id: 'y' }])).toBe('y');
    expect(chosenRobot(null, mapWith([]), [])).toBeNull();
  });
});

describe('robot map ghost on the floor', () => {
  it('sits at the current alignment once imported', () => {
    const source = { ...SOURCE, transform: { rotationDeg: 90, tx: 5, ty: 1, mirrored: true } };
    expect(ghostTransform({ source, robot: ROBOT }, null)).toEqual(source.transform);
  });

  it('is centred on the floor with no turn before any alignment exists', () => {
    const floor = { minX: 0, minY: 0, maxX: 10, maxY: 6 };
    expect(ghostTransform({ source: null, robot: ROBOT }, floor)).toEqual({
      rotationDeg: 0,
      tx: 3,
      ty: 2,
      mirrored: false,
    });
  });

  it('reads a floor point back on the robot map through a turned and mirrored alignment', () => {
    const transform = { rotationDeg: 90, tx: 5, ty: 1, mirrored: true };
    const back = houseToRobot(transform, { x: 4, y: 4 });
    expect(back.x).toBeCloseTo(-3, 6);
    expect(back.y).toBeCloseTo(1, 6);
  });

  it('draws the robot rooms in blue, robot points as blue dots and house points as amber rings', () => {
    const draft = alignTap(alignTap(EMPTY_ALIGN, 'source', { x: 1, y: 1 }), 'house', {
      x: 8,
      y: 8,
    });
    const transform = { rotationDeg: 0, tx: 0, ty: 0, mirrored: false };
    const overlay = EDIT_OVERLAY.parse(
      alignOverlay({ robot: ROBOT, draft, readOnly: false }, transform),
    );
    expect(overlay.mode).toBe('none');
    expect(overlay.ghosts.map((ghost) => [ghost.shape, ghost.tone])).toEqual([
      ['polygon', 'info'],
      ['polyline', 'neutral'],
      ['polygon', 'info'],
      ['polyline', 'accent'],
    ]);
    expect(alignOverlay({ robot: [], draft, readOnly: false }, transform)).toBeNull();
  });
});

describe('four taps on the stage', () => {
  const transform = { rotationDeg: 0, tx: 10, ty: 0, mirrored: false };

  it('takes a robot point only on the ghost, then the house point anywhere on the floor', () => {
    store.devices = [robot(ROBOT_ID, 'Robot')];
    const drafts: AlignDraft[] = [];
    const align = alignOf({ map: mapWith([SOURCE]), drafts });
    alignEdit(align, transform, tap(1, 1));
    expect(drafts).toEqual([]);
    alignEdit(align, transform, tap(11, 1));
    expect(drafts.at(-1)?.[0].source).toEqual({ x: 1, y: 1 });
    const housed = alignOf({ map: mapWith([SOURCE]), drafts, draft: drafts.at(-1) ?? EMPTY_ALIGN });
    alignEdit(housed, transform, tap(-3, 7));
    expect(drafts.at(-1)?.[0].house).toEqual({ x: -3, y: 7 });
  });

  it('ignores taps before import or while read-only and names the next tap in the notice', () => {
    store.devices = [robot(ROBOT_ID, 'Robot')];
    const drafts: AlignDraft[] = [];
    alignEdit(alignOf({ map: mapWith([]), drafts }), transform, tap(11, 1));
    alignEdit(alignOf({ map: mapWith([SOURCE]), drafts, readOnly: true }), transform, tap(11, 1));
    expect(drafts).toEqual([]);
    expect(alignNotice(alignOf({ map: mapWith([]) }))).toBeNull();
    expect(alignNotice(alignOf({ map: mapWith([SOURCE]) }))).toEqual({
      text: 'Tap point 1 on the blue robot map',
      tone: 'info',
    });
  });
});

describe('import and align panel', () => {
  it('offers the import wizard before a robot map is imported', () => {
    store.devices = [robot(ROBOT_ID, 'Robot')];
    const items = render(mapWith([]));
    expect(labels(items, 'Button')).toEqual(['Import the robot map']);
    expect(labels(items, 'View')).not.toContain('Line up the robot map');
  });

  it('shows four numbered steps once imported, with Save alignment waiting for all four', () => {
    store.devices = [robot(ROBOT_ID, 'Robot')];
    const items = render(mapWith([SOURCE]));
    expect(labels(items, 'Button')).toEqual([
      'Update from the robot',
      'Save alignment',
      'Start over',
    ]);
    expect(labels(items, 'View')).toContain('Line up the robot map');
    const steps = items
      .filter((item) => item.kind === 'Text')
      .map((item) => item.props.children)
      .filter((child): child is string => typeof child === 'string' && child.startsWith('Tap'));
    expect(steps).toEqual([
      'Tap point 1 on the blue robot map',
      'Tap the same spot as point 1 on the floor',
      'Tap point 2 on the blue robot map',
      'Tap the same spot as point 2 on the floor',
    ]);
    const save = items.find(
      (item) => item.kind === 'Button' && item.props['label'] === 'Save alignment',
    );
    expect(save?.props['disabled']).toBe(true);
  });

  it('turns Save alignment on once all four points exist', () => {
    store.devices = [robot(ROBOT_ID, 'Robot')];
    const full: AlignDraft = [
      { source: { x: 1, y: 1 }, house: { x: 2, y: 2 } },
      { source: { x: 3, y: 1 }, house: { x: 4, y: 2 } },
    ];
    const items = render(mapWith([SOURCE]), false, full);
    const save = items.find(
      (item) => item.kind === 'Button' && item.props['label'] === 'Save alignment',
    );
    expect(save?.props['disabled']).toBe(false);
    expect(save?.props['variant']).toBeUndefined();
  });

  it('keeps import paused while offline and always shows what reaches the robot', () => {
    store.devices = [robot(ROBOT_ID, 'Robot')];
    const items = render(mapWith([]), true);
    const button = items.find((item) => item.kind === 'Button');
    expect(button?.props['disabled']).toBe(true);
    const texts = items.filter((item) => item.kind === 'Text').map((item) => item.props.children);
    expect(texts).toContain('What reaches the robot');
  });

  it('says the map is drawn by hand when there is no robot', () => {
    store.devices = [];
    const items = render(mapWith([]));
    expect(labels(items, 'Button')).toEqual([]);
    const texts = items
      .filter((item) => item.kind === 'Text')
      .map((item) => item.props.children)
      .filter((child): child is string => typeof child === 'string');
    expect(texts.join(' ')).toMatch(/Draw the rooms by hand/);
  });
});
