import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP, HOME_MAP_FLOOR } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import type { MenuItem } from '../../../components/menu';
import type { HomeMapEditing } from '../data/home-map-query';
import type { EditorTool } from './tool-state';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());
const start = vi.hoisted((): { params: Record<string, string> } => ({ params: {} }));
const world = vi.hoisted(() => ({
  phone: true,
  connected: true,
  draft: false,
  menu: new Array<MenuItem>(),
  furniture: new Array<Readonly<Record<string, unknown>>>(),
  undo: vi.fn(() => Promise.resolve({ kind: 'saved' })),
  redo: vi.fn(() => Promise.resolve({ kind: 'saved' })),
  edit: vi.fn((_ops: readonly unknown[]) => Promise.resolve({ kind: 'saved' })),
  editingMap: vi.fn<(actor: string, mapId?: string) => void>(),
}));
const mounts = vi.hoisted(() => ({
  fields: { overlay: null, onEdit: null, notice: null, draft: false, layer: null },
}));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

function panelMount(kind: string): () => (args: { readonly tool: string }) => object {
  return () => (args) => ({
    ...mounts.fields,
    panel: createElement(stub(kind), { tool: args.tool }),
  });
}

vi.mock('react-native', () => ({
  View: stub('View'),
  ScrollView: stub('ScrollView'),
  Platform: { OS: 'android' },
}));
vi.mock('expo-router', () => ({
  useRouter: (): object => ({ back: vi.fn() }),
  useLocalSearchParams: (): Record<string, string> => start.params,
}));
vi.mock('../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../components/error-state', () => ({ ErrorState: stub('ErrorState') }));
vi.mock('../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: stub('Skeleton') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/menu', () => ({
  useAnchoredMenu: (items: readonly MenuItem[]): object => {
    world.menu = [...items];
    return { ref: null, open: vi.fn(), menu: null };
  },
}));
vi.mock('../../../store/selectors', () => ({
  useRooms: (): readonly object[] => [],
  useDevices: (): readonly object[] => [],
}));
vi.mock('./editor-stage', () => ({ EditorStage: stub('EditorStage') }));
vi.mock('./tools/rooms-mount', () => ({ useRoomsMount: panelMount('RoomsPanel') }));
vi.mock('./tools/walls-mount', () => ({ useWallsMount: panelMount('WallsOpeningsPanel') }));
vi.mock('./tools/materials-mount', () => ({ useMaterialsMount: panelMount('MaterialsPanel') }));
vi.mock('./tools/measure-notes-mount', () => ({
  useMeasureNotesMount: panelMount('MeasureNotesPanel'),
}));
vi.mock('./tools/align-mount', () => ({
  useAlignMount:
    (input: Props): unknown =>
    () => ({
      ...mounts.fields,
      panel: createElement(stub('VacuumAlignPanel'), { mapId: input['mapId'] }),
    }),
}));
vi.mock('./tools/scan-align-mount', () => ({ useScanAlignMount: panelMount('ScanAlignPanel') }));
vi.mock('./tools/device-room-flow', () => ({ useDeviceRoomFlow: (): object => ({}) }));
vi.mock('./tools/devices-mount', () => ({
  useDevicesMount:
    (input: Props): unknown =>
    () => ({
      ...mounts.fields,
      panel: createElement(stub('DevicesPanel'), { selected: input['selected'] }),
    }),
}));
vi.mock('./tools/furniture-mount', async () => {
  const { NO_EDIT_OVERLAY } = await import('../../../components/house-map/3d/map-3d-edit-protocol');
  return {
    useFurnitureMount: (input: Readonly<Record<string, unknown>>): object => {
      world.furniture.push(input);
      return {
        specOf: (): undefined => undefined,
        mount: (args: { readonly placing: boolean }): object => ({
          ...mounts.fields,
          overlay: args.placing ? null : { ...NO_EDIT_OVERLAY, mode: 'select' },
          draft: world.draft,
          panel: createElement(stub('FurniturePanel'), { catalogue: args.placing }),
          bar: null,
        }),
      };
    },
  };
});
vi.mock('./list-editor/list-mode', () => ({ ListMode: stub('ListMode') }));
vi.mock('../../../components/house-map/adapters/home-map-scene', () => ({
  homeMapRenderScene: (): object => ({
    key: 'home:1',
    floors: [
      { id: 'ground', rooms: [{ id: 'living' }], objects: [] },
      { id: 'up', rooms: [], objects: [] },
    ],
  }),
}));
vi.mock('../components/stage/stage-states', () => ({ EmptyFloorRow: stub('EmptyFloorRow') }));
vi.mock('../../../design/size-class', () => ({ useIsPhone: (): boolean => world.phone }));
vi.mock('../../../store/people', () => ({ useActiveProfile: (): object => ({ id: 'p1' }) }));
vi.mock('../data/home-map-query', () => ({
  useHomeMap: (): object => ({
    map: {
      name: 'Our house',
      revision: 7,
      floors: [
        { id: 'up', name: 'Upstairs', level: 1, rooms: [], objects: [], placements: [] },
        {
          id: 'ground',
          name: 'Ground',
          level: 0,
          rooms: [{ id: 'living' }],
          objects: [],
          placements: [],
        },
      ],
    },
    loading: false,
    failure: null,
    retry: vi.fn(),
  }),
  useHomeMapEditing: (actor: string, mapId?: string): object => {
    world.editingMap(actor, mapId);
    return {
      state: {
        status: { kind: 'idle' },
        connected: world.connected,
        canUndo: true,
        canRedo: false,
      },
      edit: world.edit,
      undo: world.undo,
      redo: world.redo,
      dismiss: vi.fn(),
    };
  },
}));

const { EditorBody, HomeMapEditorScreen, toolHint } = await import('./editor-screen');
const { INITIAL_TOOL_STATE } = await import('./tool-state');
const { PAUSED_NOTICE, WEBGL_NOTICE, stageNoticeOf } = await import('./stage-notice');
const { homeMapEditorHref } = await import('../search-shared');

const LIST_MAP = HOME_MAP.parse({
  id: 'map-2',
  schemaVersion: 1,
  revision: 1,
  name: 'Our house',
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

const saved = (): ReturnType<HomeMapEditing['edit']> => Promise.resolve({ kind: 'saved' });

const LIST_EDITING: HomeMapEditing = {
  state: { status: { kind: 'idle' }, connected: true, canUndo: false, canRedo: false },
  edit: saved,
  undo: saved,
  redo: saved,
  dismiss: vi.fn(),
};

function renderTool(tool: EditorTool): void {
  start.params = hrefParams(homeMapEditorHref({ tool, mapId: 'map-2' }));
  render();
}

function hrefParams(href: AppHref): Record<string, string> {
  if (typeof href === 'string' || !('params' in href)) return {};
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(href.params ?? {})) {
    if (typeof value === 'string') params[key] = value;
  }
  return params;
}

function kinds(): readonly string[] {
  return seen.map((item) => item.kind);
}

function render(): void {
  seen.length = 0;
  world.furniture.length = 0;
  renderToStaticMarkup(createElement(HomeMapEditorScreen));
}

function find(kind: string, label: string): Props {
  const found = seen.find((item) => item.kind === kind && item.props['label'] === label);
  if (found === undefined) throw new Error(`no ${kind} ${label}`);
  return found.props;
}

function only(kind: string): Props {
  const found = seen.find((item) => item.kind === kind);
  if (found === undefined) throw new Error(`no ${kind}`);
  return found.props;
}

function option(id: string): MenuItem {
  const found = world.menu.find((item) => item.id === id);
  if (found === undefined) throw new Error(`no option ${id}`);
  return found;
}

function texts(): readonly unknown[] {
  return seen.filter((item) => item.kind === 'Text').map((item) => item.props.children);
}

function viewClasses(): readonly unknown[] {
  return seen.filter((item) => item.kind === 'View').map((item) => item.props['className']);
}

function press(onPress: unknown): void {
  if (typeof onPress !== 'function') throw new Error('not pressable');
  Reflect.apply(onPress, undefined, []);
}

function toolLabels(): readonly unknown[] {
  return seen.filter((item) => item.kind === 'Interactive').map((item) => item.props['label']);
}

beforeEach(() => {
  start.params = {};
  world.phone = true;
  world.connected = true;
  world.draft = false;
  world.undo.mockClear();
  world.edit.mockClear();
  world.editingMap.mockClear();
});

describe('HomeMapEditorScreen', () => {
  it('docks the panel below the map on a phone and beside it on a tablet', () => {
    render();
    expect(viewClasses()).toContain('flex-1 flex-col');
    world.phone = false;
    render();
    expect(viewClasses()).toContain('flex-1 flex-row');
  });

  it('edits the lowest floor in the 3D stage, opening in Top, with no 2D map', () => {
    render();
    const stage = only('EditorStage');
    expect(stage['floor']).toMatchObject({ id: 'ground' });
    expect(stage['editor']).toMatchObject({ floorId: 'ground', tools: { camera: 'top' } });
    expect(stage['notice']).toBeNull();
    expect(kinds()).not.toContain('Map2d');
    expect(kinds()).not.toContain('EditorViewSwitch');
    expect(seen.some((item) => item.props['label'] === 'Floor')).toBe(false);
  });

  it('feeds the Select overlay with the edit floor of this revision', () => {
    render();
    expect(only('EditorStage')['mount']).toMatchObject({
      overlay: { mode: 'select' },
      editFloor: {
        key: 'ground:7:',
        committed: null,
        wire: { floor: { id: 'ground' }, boxes: {} },
      },
    });
  });

  it('sends a committed drag as one edit and answers an empty one at once', () => {
    render();
    const commit = world.furniture[0]?.['commit'];
    if (typeof commit !== 'function') throw new Error('no commit');
    const ops = [{ op: 'update', kind: 'object', floorId: 'ground', id: 'sofa', patch: {} }];
    Reflect.apply(commit, undefined, [4, ops]);
    expect(world.edit).toHaveBeenCalledExactlyOnceWith(ops);
    Reflect.apply(commit, undefined, [5, []]);
    expect(world.edit).toHaveBeenCalledOnce();
  });

  it('opens the Rooms tool by itself on an empty floor', () => {
    start.params = { floorId: 'up' };
    render();
    expect(find('Interactive', 'Rooms')['selected']).toBe(true);
    expect(kinds()).toContain('RoomsPanel');
    expect(kinds()).not.toContain('EmptyFloorRow');
  });

  it('shows six tool slots and the active extra tool in the last one', () => {
    render();
    expect(toolLabels()).toEqual(['Select', 'Rooms', 'Walls', 'Furniture', 'Devices', 'More']);
    renderTool('scan');
    expect(find('Interactive', 'Realistic')['selected']).toBe(true);
    expect(find('Interactive', 'Realistic')['expanded']).toBe(true);
    expect(kinds()).toContain('ScanAlignPanel');
  });

  it('runs undo, and adds a floor from the Editor options', () => {
    render();
    expect(texts()).toContain('Saved');
    expect(find('IconButton', 'Redo')['disabled']).toBe(true);
    expect(find('IconButton', 'Editor options')['icon']).toBe('customize');
    press(find('IconButton', 'Undo')['onPress']);
    expect(world.undo).toHaveBeenCalledTimes(1);
    press(option('floor').onPress);
    const ops = world.edit.mock.calls[0]?.[0];
    expect(ops).toMatchObject([{ op: 'addFloor', floor: { name: 'Floor 3', level: 2 } }]);
  });

  it('keeps Done filled and turns it tonal while a draft is open', () => {
    render();
    expect(find('Button', 'Done')['variant']).toBe('filled');
    world.draft = true;
    render();
    expect(find('Button', 'Done')['variant']).toBe('tonal');
  });

  it('is read only offline: the stage says so and editing tools are disabled', () => {
    world.connected = false;
    render();
    expect(texts()).toContain('Offline: editing is paused');
    expect(only('EditorStage')['notice']).toEqual({ text: PAUSED_NOTICE, tone: 'warning' });
    expect(find('IconButton', 'Undo')['disabled']).toBe(true);
    expect(option('floor').disabled).toBe(true);
    expect(find('Interactive', 'Walls')['disabled']).toBe(true);
    expect(find('Interactive', 'Select')['disabled']).toBe(false);
  });

  it('the Select tool mounts the panel without the catalogue', () => {
    render();
    expect(find('Interactive', 'Select')['selected']).toBe(true);
    expect(only('FurniturePanel')['catalogue']).toBe(false);
    renderTool('furniture');
    expect(only('FurniturePanel')['catalogue']).toBe(true);
    expect(only('EditorStage')['mount']).toMatchObject({ overlay: null, editFloor: null });
  });

  it('mounts the panel of each tool next to the stage', () => {
    for (const [tool, panel] of [
      ['walls', 'WallsOpeningsPanel'],
      ['openings', 'WallsOpeningsPanel'],
      ['devices', 'DevicesPanel'],
      ['materials', 'MaterialsPanel'],
      ['measure', 'MeasureNotesPanel'],
      ['notes', 'MeasureNotesPanel'],
    ] as const) {
      renderTool(tool);
      expect(kinds()).toEqual(expect.arrayContaining(['EditorStage', panel]));
      expect(only(panel)['tool']).toBe(tool === 'devices' ? undefined : tool);
    }
  });

  it('picking Align mounts the vacuum align panel for the map', () => {
    renderTool('align');
    expect(world.editingMap).toHaveBeenCalledWith('profile:p1', 'map-2');
    expect(only('VacuumAlignPanel')['mapId']).toBe('map-2');
  });

  it('swaps the stage for the list editor from the Editor options', () => {
    render();
    expect(option('view').label).toBe('List editor');
    expect(option('side').label).toBe('Side view');
    const dispatch = vi.fn();
    seen.length = 0;
    renderToStaticMarkup(
      createElement(EditorBody, {
        map: LIST_MAP,
        mapId: undefined,
        actor: 'profile:p1',
        editing: LIST_EDITING,
        tools: { ...INITIAL_TOOL_STATE, tool: 'furniture', view: 'list' },
        dispatch,
        readOnly: false,
        floorId: 'ground',
        onDone: vi.fn(),
      }),
    );
    expect(kinds()).toContain('ListMode');
    expect(kinds()).not.toContain('EditorStage');
    expect(only('ListMode')).toMatchObject({ floorId: 'ground', actor: 'profile:p1' });
    expect(option('view').label).toBe('Back to the map');
    press(option('view').onPress);
    expect(dispatch).toHaveBeenCalledWith({ type: 'view', view: 'map' });
    press(option('side').onPress);
    expect(dispatch).toHaveBeenCalledWith({ type: 'camera', camera: 'side' });
  });

  it('opens the tool and device named by a search link', () => {
    start.params = hrefParams(homeMapEditorHref({ tool: 'devices', device: 'lamp-1' }));
    render();
    expect(find('Interactive', 'Devices')['selected']).toBe(true);
    expect(find('Interactive', 'Select')['selected']).toBe(false);
    expect(only('DevicesPanel')['selected']).toBe('lamp-1');
  });
});

describe('editor stage notice and hint', () => {
  const idle = { kind: 'idle' } as const;

  it('names the most pressing state first', () => {
    const notice = { text: 'Tap the floor to place the armchair', tone: 'info' } as const;
    expect(stageNoticeOf({ unavailable: true, readOnly: true, status: idle, notice })).toEqual({
      text: WEBGL_NOTICE,
      tone: 'warning',
    });
    expect(stageNoticeOf({ unavailable: false, readOnly: true, status: idle, notice })).toEqual({
      text: PAUSED_NOTICE,
      tone: 'warning',
    });
    expect(
      stageNoticeOf({ unavailable: false, readOnly: false, status: { kind: 'not_saved' }, notice }),
    ).toEqual({ text: 'Your last change did not save: try again', tone: 'error' });
    expect(stageNoticeOf({ unavailable: false, readOnly: false, status: idle, notice })).toBe(
      notice,
    );
  });

  it('adds the camera gestures of the device to the Select hint', () => {
    expect(toolHint('select', false, true)).toBe(
      'Tap anything to select it. One finger turns the view, two fingers pan and zoom.',
    );
    expect(toolHint('select', false, false)).toBe(
      'Tap anything to select it. Drag to pan, right drag to turn, scroll to zoom.',
    );
    expect(toolHint('walls', true, true)).toBe('You can look around while editing is paused.');
  });
});
