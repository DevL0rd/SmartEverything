import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { StageContext, StageProps } from './stage';

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
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../design/size-class', () => ({
  useSizeClass: (): { width: string } => ({ width: 'compact' }),
  atLeast: (): boolean => false,
}));
vi.mock('../../../../components/house-map/live-visibility/stage-host', () => ({
  StageHost: (props: Props & { readonly renderLive: (live: object) => ReactNode }): ReactNode => {
    seen.push({ kind: 'StageHost', props });
    return props.renderLive({ active: true });
  },
}));

const { Stage, stagePieces } = await import('./stage');

type View = '3d' | 'realistic';

const VIEWS = [
  { value: '3d', label: '3D' },
  { value: 'realistic', label: 'Realistic' },
] as const;

const contexts = new Array<StageContext>();

function base(change: Partial<StageProps<View>> = {}): StageProps<View> {
  return {
    content: {
      kind: 'direct',
      render: (context): ReactNode => {
        contexts.push(context);
        return null;
      },
    },
    views: VIEWS,
    view: '3d',
    onViewChange: vi.fn(),
    tools: {
      tools3d: true,
      lights: { on: true, onToggle: vi.fn() },
      onFullScreen: vi.fn(),
      onEdit: vi.fn(),
    },
    ...change,
  };
}

function render(change: Partial<StageProps<View>> = {}): readonly Seen[] {
  seen.length = 0;
  contexts.length = 0;
  renderToStaticMarkup(createElement(Stage<View>, base(change)));
  return [...seen];
}

function all(entries: readonly Seen[], kind: string): readonly Props[] {
  return entries.filter((entry) => entry.kind === kind).map((entry) => entry.props);
}

function labels(entries: readonly Seen[]): readonly unknown[] {
  return all(entries, 'IconButton').map((props) => props['label']);
}

const FLOORS = {
  options: [
    { id: 'ground', label: 'Ground' },
    { id: 'first', label: 'First' },
  ],
  value: 'ground',
  onChange: vi.fn(),
};

describe('home map stage shell', () => {
  it('draws the view switcher, lights on by default, fit, full screen and edit', () => {
    const drawn = render();
    expect(all(drawn, 'Segmented')[0]).toMatchObject({ label: 'View', value: '3d' });
    expect(labels(drawn)).toEqual(['Lights', 'Fit', 'Full screen', 'Edit map']);
    expect(all(drawn, 'Segmented')[1]).toMatchObject({ label: 'Camera angle', fill: true });
    expect(all(drawn, 'IconButton')[0]).toMatchObject({ icon: 'bulb', selected: true });
    expect(contexts[0]).toMatchObject({ focus: { kind: 'none' } });
    expect(contexts[0]).not.toHaveProperty('lightsOn');
  });

  it('shows the floor switcher only with two or more floors', () => {
    const two = all(render({ floors: FLOORS }), 'Segmented').map((props) => props['label']);
    expect(two).toEqual(['View', 'Floor', 'Camera angle']);
    const one = { ...FLOORS, options: FLOORS.options.slice(0, 1) };
    expect(all(render({ floors: one }), 'Segmented').map((props) => props['label'])).toEqual([
      'View',
      'Camera angle',
    ]);
  });

  it('offers no lights toggle or follow unless asked', () => {
    const drawn = render({ tools: { tools3d: false } });
    expect(labels(drawn)).toEqual([]);
    expect(contexts[0]).toMatchObject({ view3d: { follow: false } });
  });

  it('draws the lights toggle from the saved look', () => {
    const onToggle = vi.fn();
    const drawn = render({ tools: { tools3d: false, lights: { on: false, onToggle } } });
    expect(all(drawn, 'IconButton')[0]).toMatchObject({
      icon: 'bulb',
      selected: false,
      onPress: onToggle,
    });
  });

  it('lets the parent size a pinned stage without an aspect ratio', () => {
    const frame = (variant: 'page' | 'pinned'): unknown =>
      all(render({ variant }), 'View')[0]?.['className'];
    expect(frame('pinned')).not.toMatch(/aspect-/);
    expect(frame('pinned')).toMatch(/size-full/);
    expect(frame('page')).toMatch(/aspect-19\/15/);
  });

  it('shows the map switcher in the top bar only with two or more maps', () => {
    const maps = {
      options: [
        { id: 'home', label: 'Home' },
        { id: 'studio', label: 'Studio' },
      ],
      value: 'home',
      onChange: vi.fn(),
    };
    expect(all(render({ maps }), 'Interactive')[0]).toMatchObject({
      label: 'Map Home. Switch map',
    });
    expect(stagePieces(base({ maps }))).toContain('floors');
    const one = { ...maps, options: maps.options.slice(0, 1) };
    expect(all(render({ maps: one }), 'Interactive')).toEqual([]);
    expect(stagePieces(base({ maps: one }))).not.toContain('floors');
  });

  it('names the stage as one group by its summary', () => {
    const summary = 'Home map, Ground floor, 2 rooms, no lights on';
    expect(all(render({ summary }), 'View')[0]).toMatchObject({
      role: 'group',
      'aria-label': summary,
    });
    expect(all(render({ summary, variant: 'face' }), 'View')[0]).toMatchObject({
      role: 'group',
      'aria-label': summary,
    });
  });

  it('keeps its own camera angle unless the parent owns it', () => {
    const own = all(render(), 'Segmented')[1];
    expect(own).toMatchObject({
      label: 'Camera angle',
      value: 'angled',
      options: [
        { value: 'angled', label: '3D', spoken: '3D view' },
        { value: 'top', label: 'Top', spoken: 'View from the top' },
      ],
    });
    expect(contexts[0]?.view3d.preset).toBe('angled');
    const onPreset = vi.fn();
    const owned = all(render({ camera: { preset: 'side', onPreset } }), 'Segmented')[1];
    expect(owned).toMatchObject({ label: 'Camera angle', value: 'side', onChange: onPreset });
    expect(contexts[0]?.view3d.preset).toBe('side');
  });

  it('passes the focus to the scene', () => {
    render({ focus: { kind: 'room', roomId: 'kitchen' } });
    expect(contexts[0]?.focus).toEqual({ kind: 'room', roomId: 'kitchen' });
  });

  it('draws no chrome at all on a face', () => {
    const drawn = render({ variant: 'face', notices: 'Made from the robot map' });
    expect(all(drawn, 'Segmented')).toEqual([]);
    expect(all(drawn, 'IconButton')).toEqual([]);
    expect(contexts[0]?.chrome).toEqual([]);
  });

  it('registers a live scene with the stage host and renders it with the live props', () => {
    const still = createElement('div');
    const live = vi.fn((): ReactNode => null);
    const drawn = render({
      content: { kind: 'live', id: 'home-hero', still, modalCovered: true, render: live },
    });
    expect(all(drawn, 'StageHost')[0]).toMatchObject({
      id: 'home-hero',
      still,
      modalCovered: true,
    });
    expect(live).toHaveBeenCalledOnce();
    expect(live.mock.calls[0]).toMatchObject([{ variant: 'page' }, { active: true }]);
  });

  it('measures only the chrome pieces it shows', () => {
    expect(stagePieces(base({ floors: FLOORS, notices: 'note' }))).toEqual([
      'switcher',
      'floors',
      'tools',
      'notes',
    ]);
    expect(
      stagePieces(
        base({ views: VIEWS.slice(0, 1), tools: null, pill: { text: 'x', tone: 'idle' } }),
      ),
    ).toEqual(['pill']);
  });
});
