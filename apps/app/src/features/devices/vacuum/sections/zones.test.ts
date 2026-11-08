import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEVICE_ROW, VACUUM_SCENE, type VacuumScene } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceOf } from '../../../../store/state';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

interface Hooked {
  scene: unknown;
  loading: boolean;
  status: number | undefined;
  online: boolean;
  zones: boolean;
  unified: unknown;
}

const hooked = vi.hoisted((): Hooked => ({
  scene: null,
  loading: false,
  status: undefined,
  online: true,
  zones: false,
  unified: null,
}));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('../../../../api/transport', () => ({ api: (): object => ({}) }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/empty-state', () => ({ EmptyState: stub('EmptyState') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../store/mutation', () => ({
  useMutationState: (): object => ({ busy: false, problem: null, run: vi.fn() }),
}));
vi.mock('../components/zone-editor/zone-shapes', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cleanZonesOf: (): readonly object[] => (hooked.zones ? [{ x1: 0, y1: 0, x2: 1, y2: 1 }] : []),
}));
vi.mock('../components/zone-editor/zone-editor', () => ({ ZoneEditor: stub('ZoneEditor') }));
vi.mock('../data/scene-query', () => ({
  useVacuumScene: (): object => ({ scene: hooked.scene, loading: hooked.loading }),
}));
vi.mock('../data/use-unified-map', () => ({
  useUnifiedMap: (): unknown => hooked.unified,
}));
vi.mock('../data/use-vacuum', () => ({
  useVacuum: (): object => ({
    snapshot: {
      values:
        hooked.status === undefined ? {} : { vacuum_status: hooked.status, vacuum_asleep: false },
      online: hooked.online,
      mapVersionText: undefined,
    },
  }),
}));
vi.mock('../data/use-vacuum-actions', () => ({
  useVacuumActions: (): object => ({ cleanZones: vi.fn() }),
}));

const { VacuumZones } = await import('./zones');

const scene: VacuumScene = VACUUM_SCENE.parse(
  JSON.parse(
    readFileSync(new URL('../model/scene-geometry.fixture.json', import.meta.url), 'utf8'),
  ),
);

const NOW = '2026-10-24T10:00:00.000Z';

const device = deviceOf(
  DEVICE_ROW.parse({
    id: '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    provider: 'xiaomi',
    external_id: 'robot-1',
    parent_id: null,
    kind: 'vacuum',
    name: 'Vacuum',
    display_name: null,
    model: 'xiaomi.vacuum.pv11gl',
    manufacturer: 'Xiaomi',
    provider_room: null,
    room_id: null,
    online: true,
    capabilities: [],
    details: {},
    hidden: false,
    favourite: false,
    position: 0,
    created_at: NOW,
    updated_at: NOW,
  }),
);

function render(): readonly Seen[] {
  seen.length = 0;
  renderToStaticMarkup(createElement(VacuumZones, { device }));
  return [...seen];
}

describe('VacuumZones', () => {
  beforeEach(() => {
    hooked.scene = null;
    hooked.loading = false;
    hooked.status = undefined;
    hooked.online = true;
    hooked.zones = false;
    hooked.unified = null;
  });

  it('says the map is loading', () => {
    hooked.loading = true;
    const empty = render().find((entry) => entry.kind === 'EmptyState');
    expect(empty?.props['title']).toBe('Loading the map');
  });

  it('offers a first mapping when there is no map', () => {
    const empty = render().find((entry) => entry.kind === 'EmptyState');
    expect(empty?.props['title']).toBe('No map yet');
    expect(render().some((entry) => entry.kind === 'ZoneEditor')).toBe(false);
  });

  it('shows the editor and a disabled clean button before a zone is drawn', () => {
    hooked.scene = scene;
    const drawn = render();
    const editor = drawn.find((entry) => entry.kind === 'ZoneEditor');
    expect(editor?.props['scene']).toBe(scene);
    expect(editor?.props['deviceId']).toBe(device.id);
    const clean = drawn.find((entry) => entry.props['label'] === 'Clean 0 zones');
    expect(clean?.props['disabled']).toBe(true);
    const save = drawn.find((entry) => entry.props['label'] === 'Save areas');
    expect(save?.props['disabled']).toBe(true);
    expect(drawn.some((entry) => entry.props['label'] === 'Undo save')).toBe(false);
  });

  it('hands the unified house map to the editor so edits convert to the robot frame', () => {
    hooked.scene = scene;
    const unified = { floor: { bounds: null } };
    hooked.unified = unified;
    const editor = render().find((entry) => entry.kind === 'ZoneEditor');
    expect(editor?.props['unified']).toBe(unified);
  });

  it('gives the editor no unified map when the vacuum is not placed in the house', () => {
    hooked.scene = scene;
    const editor = render().find((entry) => entry.kind === 'ZoneEditor');
    expect(editor?.props['unified']).toBeNull();
  });

  it('allows a zone clean on an awake robot that is docked and not working', () => {
    hooked.scene = scene;
    hooked.zones = true;
    hooked.status = 2;
    const clean = render().find((entry) => entry.props['label'] === 'Clean 1 zone');
    expect(clean?.props['disabled']).toBe(false);
  });

  it('blocks a zone clean while a task is running', () => {
    hooked.scene = scene;
    hooked.zones = true;
    hooked.status = 4;
    const clean = render().find((entry) => entry.props['label'] === 'Clean 1 zone');
    expect(clean?.props['disabled']).toBe(true);
  });
});
