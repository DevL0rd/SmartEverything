import { act, createElement, Fragment, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageFloors } from './stage-chrome';
import type { StageMaps } from './map-switcher';

interface Props {
  readonly children?: ReactNode;
  readonly label?: unknown;
  readonly options?: unknown;
  readonly onPress?: unknown;
  readonly onChange?: unknown;
}

interface Probe {
  width: 'compact' | 'medium';
  seen: { kind: string; props: Props }[];
  hostMounts: number;
  livePaints: string[];
}

const probe: Probe = vi.hoisted(() => ({
  width: 'compact',
  seen: [],
  hostMounts: 0,
  livePaints: [],
}));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    probe.seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({
  Text: (props: Props): ReactNode => {
    probe.seen.push({ kind: 'Text', props });
    return null;
  },
}));
vi.mock('../../../../design/size-class', () => ({
  useSizeClass: (): { width: string } => ({ width: probe.width }),
  atLeast: (width: string, at: string): boolean => width === at,
}));
vi.mock('../../../../components/house-map/live-visibility/stage-host', () => ({
  StageHost: function StageHost(
    props: Props & { readonly renderLive: (live: object) => ReactNode },
  ): ReactNode {
    useEffect(() => {
      probe.hostMounts += 1;
    }, []);
    return props.renderLive({ active: true });
  },
}));

const { PlaceSwitchers, mapsShown, placesShown } = await import('./map-switcher');
const { Stage } = await import('./stage');

const MAPS = [
  { id: 'home', label: 'Home' },
  { id: 'studio', label: 'Studio' },
  { id: 'cabin', label: 'Cabin' },
] as const;

const FLOORS: StageFloors = {
  options: [
    { id: 'ground', label: 'Ground' },
    { id: 'first', label: 'First' },
  ],
  value: 'ground',
  onChange: vi.fn(),
};

function mapsOf(value: string, onChange: (mapId: string) => void): StageMaps {
  return { options: MAPS, value, onChange };
}

function all(kind: string): readonly Props[] {
  return probe.seen.filter((entry) => entry.kind === kind).map((entry) => entry.props);
}

function segmented(label: string): Props | undefined {
  return all('Segmented').findLast((props) => props.label === label);
}

function isHandler(value: unknown): value is (...args: readonly string[]) => void {
  return typeof value === 'function';
}

function press(props: Props | undefined): void {
  const onPress = props?.onPress;
  if (!isHandler(onPress)) throw new Error('nothing to press');
  probe.seen.length = 0;
  act(() => {
    onPress();
  });
}

function choose(label: string, value: string): void {
  const onChange = segmented(label)?.onChange;
  if (!isHandler(onChange)) throw new Error(`no ${label} switcher`);
  probe.seen.length = 0;
  act(() => {
    onChange(value);
  });
}

function Page({ floors }: { readonly floors: StageFloors | undefined }): ReactNode {
  const [mapId, setMapId] = useState('home');
  return createElement(
    Fragment,
    null,
    createElement(PlaceSwitchers, { maps: mapsOf(mapId, setMapId), floors }),
    createElement(Stage<'3d'>, {
      content: {
        kind: 'live',
        id: 'home-hero',
        still: null,
        render: (): ReactNode => {
          probe.livePaints.push(mapId);
          return null;
        },
      },
      views: [{ value: '3d', label: '3D' }],
      view: '3d',
      onViewChange: vi.fn(),
      tools: null,
      variant: 'hero',
    }),
  );
}

let root: Root;

function render(node: ReactNode): void {
  probe.seen.length = 0;
  act(() => {
    root.render(node);
  });
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
  probe.width = 'compact';
  probe.hostMounts = 0;
  probe.livePaints.length = 0;
});

describe('when the switchers show', () => {
  it('shows the map switcher only with two or more maps', () => {
    expect(mapsShown(undefined)).toBe(false);
    expect(mapsShown({ options: [MAPS[0]], value: 'home', onChange: vi.fn() })).toBe(false);
    expect(mapsShown(mapsOf('home', vi.fn()))).toBe(true);
  });

  it('shows nothing with one map and one floor', () => {
    const single = { ...FLOORS, options: [{ id: 'ground', label: 'Ground' }] };
    expect(placesShown({ options: [MAPS[0]], value: 'home', onChange: vi.fn() }, single)).toBe(
      false,
    );
    render(createElement(PlaceSwitchers, { maps: undefined, floors: single }));
    expect(probe.seen).toEqual([]);
  });

  it('shows the floor switcher alone when there is one map', () => {
    render(createElement(PlaceSwitchers, { maps: undefined, floors: FLOORS }));
    expect(all('Segmented').map((props) => props.label)).toEqual(['Floor']);
    expect(all('Interactive')).toEqual([]);
  });
});

describe('on a phone', () => {
  it('opens the map pill in place into the map row and closes it again', () => {
    const onChange = vi.fn();
    render(createElement(PlaceSwitchers, { maps: mapsOf('studio', onChange), floors: FLOORS }));
    expect(segmented('Map')).toBeUndefined();
    const pill = all('Interactive').at(-1);
    expect(pill?.label).toBe('Map Studio. Switch map');
    expect(segmented('Floor')).toBeDefined();
    press(pill);
    expect(segmented('Map')?.options).toEqual(
      MAPS.map((map) => ({ value: map.id, label: map.label, spoken: map.label })),
    );
    press(all('IconButton').find((props) => props.label === 'Close the map list'));
    expect(segmented('Map')).toBeUndefined();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('chooses a map from the row and folds back into the pill', () => {
    const onChange = vi.fn();
    render(createElement(PlaceSwitchers, { maps: mapsOf('home', onChange), floors: undefined }));
    press(all('Interactive').at(-1));
    choose('Map', 'cabin');
    expect(onChange).toHaveBeenCalledWith('cabin');
    expect(segmented('Map')).toBeUndefined();
  });
});

describe('on a tablet or desktop', () => {
  it('shows the full map row and floor row without a pill or close button', () => {
    probe.width = 'medium';
    const onChange = vi.fn();
    render(createElement(PlaceSwitchers, { maps: mapsOf('home', onChange), floors: FLOORS }));
    expect(all('Segmented').map((props) => props.label)).toEqual(['Map', 'Floor']);
    expect(all('Interactive')).toEqual([]);
    expect(all('IconButton')).toEqual([]);
    choose('Map', 'studio');
    expect(onChange).toHaveBeenCalledWith('studio');
  });
});

describe('switching maps', () => {
  it('repaints the live stage with the new map without remounting its WebView host', () => {
    probe.width = 'medium';
    render(createElement(Page, { floors: FLOORS }));
    expect(probe.hostMounts).toBe(1);
    choose('Map', 'studio');
    choose('Map', 'cabin');
    expect(probe.livePaints.at(-1)).toBe('cabin');
    expect(probe.livePaints).toContain('studio');
    expect(probe.hostMounts).toBe(1);
  });
});
