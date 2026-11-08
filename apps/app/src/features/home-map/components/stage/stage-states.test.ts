import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { isoHouse, isoRoom } from '../../../../components/house-map/iso/iso-fixture';
import { mapDemandTargets } from '../../../../components/house-map/live-demand/use-map-demand';
import type { RenderFloor } from '../../../../components/house-map/render-scene';
import type { StageStatusFacts } from './stage-states';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('react-native-svg', () => ({ default: stub('Svg'), Path: stub('Path') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../design/colour', () => ({
  useColourResolver: (): ((role: string) => string) => (role) => role,
}));
vi.mock('../../../../design/size-class', () => ({
  useSizeClass: (): { width: string } => ({ width: 'compact' }),
  atLeast: (): boolean => false,
}));
vi.mock('../../../../components/house-map/iso/iso-still', () => ({ IsoStill: stub('IsoStill') }));

const {
  EmptyFloorRow,
  NoMapHouse,
  noMapRobotActions,
  noMapTitle,
  stageChromeShown,
  stageDemand,
  stageDimmed,
  stageIdOf,
  stageNotices,
  stageNoticesNode,
  stagePhase,
  stageStill,
} = await import('./stage-states');

function render(node: ReactNode): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement('div', null, node));
  return [...seen];
}

function kinds(entries: readonly Seen[]): readonly string[] {
  return entries.map((entry) => entry.kind);
}

const HOUSE = isoHouse();

const BARE: RenderFloor = { ...HOUSE, rooms: [] };

function status(change: Partial<StageStatusFacts> = {}): StageStatusFacts {
  return {
    phase: 'map',
    connected: true,
    loadFailed: false,
    crashed: false,
    leaseFailed: false,
    madeFromRobot: false,
    mapNotices: [],
    ...change,
  };
}

function texts(facts: StageStatusFacts, actions = {}): readonly string[] {
  return stageNotices(facts, actions).map((notice) => notice.text);
}

const FACTS = {
  vacuumIds: ['robot-a', 'robot-b'],
  sensorIds: ['shelly-x'],
  showRobot: true,
  showPeople: true,
};

describe('stage phases', () => {
  it('shows the skeleton while loading with no cache and the cached map while refetching', () => {
    expect(stagePhase({ hasMap: false, loading: true, floor: null })).toBe('skeleton');
    expect(stagePhase({ hasMap: true, loading: true, floor: HOUSE })).toBe('map');
  });

  it('is the no-map state only once loading settled without a map', () => {
    expect(stagePhase({ hasMap: false, loading: false, floor: null })).toBe('no-map');
    expect(stageChromeShown('no-map')).toBe(false);
    expect(stageChromeShown('skeleton')).toBe(false);
  });

  it('is an empty floor for a map floor with no rooms, with the chrome kept', () => {
    expect(stagePhase({ hasMap: true, loading: false, floor: BARE })).toBe('empty-floor');
    expect(stageChromeShown('empty-floor')).toBe(true);
  });

  it('keeps every room of a floor with many rooms', () => {
    const many: RenderFloor = {
      ...HOUSE,
      rooms: Array.from({ length: 40 }, (_, index) =>
        isoRoom(`room-${String(index)}`, index, index + 1),
      ),
    };
    expect(stagePhase({ hasMap: true, loading: false, floor: many })).toBe('map');
    const drawn = render(stageStill({ floor: many }, 'Home')({ unavailable: false }));
    const still = drawn.find((entry) => entry.kind === 'IsoStill');
    expect(still?.props['input']).toEqual({ floor: many });
    expect(still?.props['fill']).toBe(true);
  });
});

describe('stage notices', () => {
  it('shows the offline chip over the last map and dims the live overlays', () => {
    expect(texts(status({ connected: false }))).toEqual(['Offline · showing the last map']);
    expect(stageDimmed('map', false)).toBe(true);
    expect(stageDimmed('map', true)).toBe(false);
  });

  it('offers a retry when the first load failed and never shows map notices on the skeleton', () => {
    const onRetryLoad = vi.fn();
    const [notice] = stageNotices(
      status({ phase: 'skeleton', loadFailed: true, madeFromRobot: true }),
      { onRetryLoad },
    );
    expect(notice).toMatchObject({ text: "Couldn't load the map · Retry", onPress: onRetryLoad });
    expect(texts(status({ phase: 'skeleton', loadFailed: true }))).toHaveLength(1);
  });

  it('shows one map notice by its text and several as one count chip that opens review', () => {
    const onEdit = vi.fn();
    const onReview = vi.fn();
    expect(stageNotices(status({ madeFromRobot: true }), { onEdit })).toEqual([
      { icon: 'info', text: "Made from the robot's map · Edit", onPress: onEdit },
    ]);
    const several = status({
      madeFromRobot: true,
      mapNotices: [{ text: 'A room is missing' }, { text: 'The map moved' }],
    });
    expect(stageNotices(several, { onReview })).toEqual([
      { icon: 'info', text: '3 map notices · Review', onPress: onReview },
    ]);
  });

  it('orders the 3D crash and the failed live view before the map notices', () => {
    const onReload = vi.fn();
    const facts = status({ crashed: true, leaseFailed: true, mapNotices: [{ text: 'Note' }] });
    expect(texts(facts)).toEqual([
      '3D stopped · Reload',
      "Live view couldn't start · Retry",
      'Note',
    ]);
    expect(stageNotices(facts, { onReload })[0]?.onPress).toBe(onReload);
  });

  it('shows nothing in the no-map state and draws no notes slot without notices', () => {
    expect(texts(status({ phase: 'no-map', connected: false, crashed: true }))).toEqual([]);
    expect(stageNoticesNode([])).toBeNull();
    const drawn = render(stageNoticesNode(stageNotices(status({ crashed: true }), {})));
    expect(kinds(drawn)).toContain('Text');
  });
});

describe('stage still', () => {
  it('draws the skeleton house when there is nothing cached', () => {
    const drawn = render(stageStill(null, null)({ unavailable: false }));
    expect(kinds(drawn)).toContain('Svg');
    expect(kinds(drawn)).not.toContain('IsoStill');
  });

  it('adds the no WebGL chip over the still when 3D is unavailable', () => {
    const drawn = render(stageStill({ floor: HOUSE }, 'Home')({ unavailable: true }));
    const chips = drawn.filter((entry) => entry.kind === 'Text').map((entry) => entry.props);
    expect(chips.map((props) => props.children)).toEqual(["3D isn't available on this device"]);
    const quiet = render(stageStill({ floor: HOUSE }, 'Home')({ unavailable: false }));
    expect(kinds(quiet).filter((kind) => kind === 'Text')).toEqual([]);
  });

  it('offers Draw rooms on an empty floor only when the editor can open', () => {
    const onDrawRooms = vi.fn();
    const drawn = render(createElement(EmptyFloorRow, { floorName: 'Ground', onDrawRooms }));
    expect(drawn.find((entry) => entry.kind === 'Button')?.props).toMatchObject({
      label: 'Draw rooms',
      onPress: onDrawRooms,
    });
    const bare = render(createElement(EmptyFloorRow, { floorName: null, onDrawRooms: undefined }));
    expect(kinds(bare)).not.toContain('Button');
  });
});

describe('stage demand per consumer', () => {
  it('gives every mounted stage its own id', () => {
    const ids = [
      stageIdOf({ kind: 'home-hero' }),
      stageIdOf({ kind: 'devices-pinned' }),
      stageIdOf({ kind: 'home-full-screen' }),
      stageIdOf({ kind: 'devices-full-screen' }),
      stageIdOf({ kind: 'room-header', roomId: 'kitchen' }),
      stageIdOf({ kind: 'vacuum-page', deviceId: 'robot-a' }),
      stageIdOf({ kind: 'vacuum-face', deviceId: 'robot-a', board: 'home' }),
      stageIdOf({ kind: 'vacuum-face', deviceId: 'robot-a', board: 'devices' }),
      stageIdOf({ kind: 'shelly-page', deviceId: 'shelly', sensorId: 'shelly-x' }),
      stageIdOf({ kind: 'shelly-face', deviceId: 'shelly', sensorId: 'shelly-x', board: 'home' }),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lets the Home hero hold the live route and the tracks like every stage', () => {
    expect(mapDemandTargets(stageDemand({ kind: 'home-hero' }, FACTS))).toEqual({
      vacuumIds: ['robot-a', 'robot-b'],
      sensorIds: ['shelly-x'],
    });
    const off = { ...FACTS, showRobot: false, showPeople: false };
    expect(mapDemandTargets(stageDemand({ kind: 'devices-pinned' }, off))).toEqual({
      vacuumIds: [],
      sensorIds: [],
    });
  });

  it('always holds the own device of a vacuum or Shelly stage', () => {
    const off = { ...FACTS, showRobot: false, showPeople: false };
    expect(
      mapDemandTargets(stageDemand({ kind: 'vacuum-page', deviceId: 'robot-b' }, off)),
    ).toEqual({ vacuumIds: ['robot-b'], sensorIds: [] });
    const shelly = {
      kind: 'shelly-face',
      deviceId: 'shelly',
      sensorId: 'shelly-y',
      board: 'devices',
    } as const;
    expect(mapDemandTargets(stageDemand(shelly, off))).toEqual({
      vacuumIds: [],
      sensorIds: ['shelly-y'],
    });
    expect(mapDemandTargets(stageDemand(shelly, FACTS)).sensorIds).toEqual([
      'shelly-y',
      'shelly-x',
    ]);
  });
});

describe('no-map copy and robot actions', () => {
  it('titles the map by its name and falls back to the default Home map', () => {
    expect(noMapTitle('Cabin')).toBe('Cabin has no map yet');
    expect(noMapTitle(null)).toBe('Home has no map yet');
    expect(noMapTitle('  ')).toBe('Home has no map yet');
  });

  it('picks the import for unfed robot maps and the quick mapping only for an idle robot', () => {
    expect(noMapRobotActions(null)).toEqual({ importMap: false, quickMapping: false });
    expect(noMapRobotActions({ unfedMaps: true, working: true })).toEqual({
      importMap: true,
      quickMapping: false,
    });
    expect(noMapRobotActions({ unfedMaps: false, working: false })).toEqual({
      importMap: false,
      quickMapping: true,
    });
    expect(noMapRobotActions({ unfedMaps: false, working: true })).toEqual({
      importMap: false,
      quickMapping: false,
    });
  });

  it('draws the house illustration hidden from screen readers', () => {
    const drawn = render(createElement(NoMapHouse));
    expect(drawn[0]?.props['accessibilityElementsHidden']).toBe(true);
    expect(kinds(drawn).filter((kind) => kind === 'Path')).toHaveLength(5);
  });
});
