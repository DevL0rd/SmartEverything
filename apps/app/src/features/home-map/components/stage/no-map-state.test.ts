import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

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
vi.mock('../../../../components/menu', () => ({ OverflowButton: stub('OverflowButton') }));
vi.mock('../../../../design/colour', () => ({
  useColourResolver: (): ((role: string) => string) => (role) => role,
}));
vi.mock('../../../../design/size-class', () => ({
  useSizeClass: (): { width: string } => ({ width: 'compact' }),
  atLeast: (): boolean => false,
}));
vi.mock('../../../../components/house-map/iso/iso-still', () => ({ IsoStill: stub('IsoStill') }));

const { NoMapState } = await import('./no-map-state');
type StateProps = Parameters<typeof NoMapState>[0];

function render(props: StateProps): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(NoMapState, props));
  return [...seen];
}

function texts(entries: readonly Seen[]): readonly unknown[] {
  return entries.filter((entry) => entry.kind === 'Text').map((entry) => entry.props.children);
}

function buttons(entries: readonly Seen[]): readonly Props[] {
  return entries.filter((entry) => entry.kind === 'Button').map((entry) => entry.props);
}

const IDLE = { create: vi.fn(), busy: false, offline: false, problem: null };

describe('no-map state', () => {
  it('names the map, explains it and offers Create a map', () => {
    const create = vi.fn();
    const drawn = render({ mapName: 'Cabin', hasVacuum: false, create: { ...IDLE, create } });
    expect(texts(drawn)).toEqual([
      'Cabin has no map yet',
      'See every room and device where it really is. Draw the rooms, then place your devices.',
    ]);
    expect(buttons(drawn)).toEqual([
      expect.objectContaining({ label: 'Create a map', onPress: create, disabled: false }),
    ]);
    expect(drawn.some((entry) => entry.kind === 'OverflowButton')).toBe(false);
  });

  it('shows the default Home map when there is no map at all', () => {
    expect(texts(render({ mapName: null, hasVacuum: true, create: IDLE }))[0]).toBe(
      'Home has no map yet',
    );
  });

  it('offers the import when the robot has maps that feed nothing', () => {
    const onImport = vi.fn();
    const robot = { unfedMaps: true, working: false, onImport, onQuickMapping: vi.fn() };
    const labels = buttons(render({ mapName: 'Home', hasVacuum: true, create: IDLE, robot }));
    expect(labels.map((props) => props['label'])).toEqual([
      'Create a map',
      'Import from your robot vacuum',
    ]);
    expect(labels[1]?.['onPress']).toBe(onImport);
  });

  it('offers the quick mapping only while the robot without a map is not working', () => {
    const onQuickMapping = vi.fn();
    const robot = { unfedMaps: false, working: false, onImport: vi.fn(), onQuickMapping };
    const idle = buttons(render({ mapName: 'Home', hasVacuum: true, create: IDLE, robot }));
    expect(idle[1]).toMatchObject({ label: 'Run a quick mapping first', onPress: onQuickMapping });
    const busy = { ...robot, working: true };
    const working = buttons(
      render({ mapName: 'Home', hasVacuum: true, create: IDLE, robot: busy }),
    );
    expect(working.map((props) => props['label'])).toEqual(['Create a map']);
  });

  it('shows progress, the offline pause and a problem line', () => {
    const busy = buttons(
      render({ mapName: 'Home', hasVacuum: false, create: { ...IDLE, busy: true } }),
    );
    expect(busy[0]).toMatchObject({ loading: true });
    const offline = render({
      mapName: 'Home',
      hasVacuum: false,
      create: { ...IDLE, offline: true, problem: 'Connect to the hub to create a map' },
    });
    expect(buttons(offline)[0]).toMatchObject({ disabled: true });
    expect(texts(offline)).toContain('Connect to the hub to create a map');
  });

  it('puts the page menu in the corner when the page gives one', () => {
    const items = [{ label: 'Hide the map from Home', onPress: vi.fn() }];
    const drawn = render({ mapName: 'Home', hasVacuum: false, create: IDLE, menu: items });
    expect(drawn.find((entry) => entry.kind === 'OverflowButton')?.props['items']).toBe(items);
  });
});
