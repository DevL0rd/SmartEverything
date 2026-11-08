import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP, HOME_MAP_FLOOR, type HomeMapOp } from '@smarteverything/domain';

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

vi.mock('react-native', () => ({ ScrollView: stub('ScrollView') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('./rooms-walls', () => ({ RoomsWallsList: stub('RoomsWallsList') }));
vi.mock('./objects-devices', () => ({ ObjectsDevicesList: stub('ObjectsDevicesList') }));

const { EDITOR_VIEW_LABEL, EditorViewSwitch, ListMode, NO_FLOOR_TEXT } =
  await import('./list-mode');

const MAP = HOME_MAP.parse({
  id: 'map-a',
  schemaVersion: 1,
  revision: 1,
  name: 'Home',
  north: 0,
  updatedAt: '2026-11-02T00:00:00.000Z',
  sources: [],
  notices: [],
  floors: [
    HOME_MAP_FLOOR.parse({
      id: 'ground',
      name: 'Ground',
      level: 0,
      elevation: 0,
      rooms: [],
      walls: [],
      openings: [],
      objects: [],
      placements: [],
      annotations: [],
    }),
  ],
});

const OPS: readonly HomeMapOp[] = [{ op: 'removeScan' }];

const edit = vi.fn((_ops: readonly HomeMapOp[]) => Promise.resolve());

function render(node: ReactNode): void {
  seen.length = 0;
  renderToStaticMarkup(node);
}

function props(kind: string): Props {
  const found = seen.find((item) => item.kind === kind);
  if (found === undefined) throw new Error(`no ${kind}`);
  return found.props;
}

function send(kind: string): void {
  const value = props(kind)['send'];
  if (typeof value !== 'function') throw new Error('no send');
  Reflect.apply(value, undefined, [OPS]);
}

beforeEach(() => {
  edit.mockClear();
});

describe('list mode of the editor', () => {
  it('shows the rooms and walls list and the furniture and devices list for the shown floor', () => {
    render(
      createElement(ListMode, {
        ...{ map: MAP, floorId: 'ground', actor: 'profile:p1', readOnly: false, edit },
      }),
    );
    for (const kind of ['RoomsWallsList', 'ObjectsDevicesList']) {
      expect(props(kind)).toMatchObject({
        map: MAP,
        floor: { id: 'ground' },
        actor: 'profile:p1',
        readOnly: false,
      });
    }
    expect(props('ScrollView')['keyboardShouldPersistTaps']).toBe('handled');
  });

  it('edits through the same map ops as the map tools', () => {
    render(
      createElement(ListMode, {
        ...{ map: MAP, floorId: 'ground', actor: 'profile:p1', readOnly: false, edit },
      }),
    );
    send('RoomsWallsList');
    send('ObjectsDevicesList');
    expect(edit.mock.calls).toEqual([[OPS], [OPS]]);
  });

  it('passes read only to both lists and asks for a floor when there is none', () => {
    render(
      createElement(ListMode, {
        ...{ map: MAP, floorId: 'gone', actor: 'profile:p1', readOnly: true, edit },
      }),
    );
    expect(seen.some((item) => item.props.children === NO_FLOOR_TEXT)).toBe(true);
    expect(seen.some((item) => item.kind === 'RoomsWallsList')).toBe(false);
  });

  it('switches between the map and the list with a labelled radio group', () => {
    const onChange = vi.fn();
    render(createElement(EditorViewSwitch, { view: 'list', onChange }));
    const segmented = props('Segmented');
    expect(segmented).toMatchObject({ label: EDITOR_VIEW_LABEL, value: 'list' });
    expect(segmented['options']).toEqual([
      { value: 'map', label: 'Map', icon: 'plan' },
      { value: 'list', label: 'List', icon: 'list' },
    ]);
    expect(segmented['onChange']).toBe(onChange);
  });
});
