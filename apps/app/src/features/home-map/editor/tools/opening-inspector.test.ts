import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOME_MAP_FLOOR,
  HOME_MAP_OPENING_WRITE,
  HOME_MAP_WALL_WRITE,
  type HomeMapOp,
  type HomeMapOpening,
  type HomeMapWall,
} from '@smarteverything/domain';
import {
  choiceOf,
  familyKinds,
  familyOf,
  familyOps,
  kindOps,
  linkCandidates,
  linkOp,
  linkStatus,
  openingHeightOp,
  plainText,
  slideOp,
  swings,
  windowOpens,
} from './opening-inspector-model';

interface Props {
  readonly children?: ReactNode;
  readonly title?: unknown;
  readonly label?: unknown;
  readonly onPress?: unknown;
  readonly [key: string]: unknown;
}

const seen = vi.hoisted(() => new Array<{ readonly kind: string; readonly props: Props }>());
const CONTACT = '3f2b8f9a-6d3c-4d6e-8d4e-0a1b2c3d4e5f';
const LOCK = '9c1d7e52-1a0b-4f3e-9b6a-2d8e4c7f1a30';
const HAND = { kind: 'hand' };

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View'), Platform: { OS: 'android' } }));
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/list-row', () => ({ ListRow: stub('ListRow') }));
vi.mock('../../../../components/number-stepper', () => ({ NumberStepper: stub('Stepper') }));
vi.mock('../../../../components/segmented', () => ({ Segmented: stub('Segmented') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../store/selectors', () => ({
  useDevices: (): readonly object[] => [
    { id: LOCK, label: 'Front lock', online: true, capabilities: [{ key: 'lock' }] },
    {
      id: CONTACT,
      label: 'Hall door',
      online: true,
      capabilities: [{ key: 'contact' }, { key: 'battery' }],
    },
    { id: 'lamp', label: 'Lamp', online: true, capabilities: [{ key: 'power' }] },
  ],
  useDeviceValue: (id: string): object => ({ value: id === LOCK, observedAt: '' }),
}));

const { OpeningInspector } = await import('./opening-inspector');
const { INITIAL_WALLS_OPENINGS } = await import('./walls-openings-model');

const wall: HomeMapWall = HOME_MAP_WALL_WRITE.parse({
  id: 'w1',
  from: { x: 0, y: 0 },
  to: { x: 4, y: 0 },
  thickness: 0.1,
  height: null,
  kind: 'solid',
  origin: HAND,
});

const opening = (patch: Partial<HomeMapOpening> = {}): HomeMapOpening =>
  HOME_MAP_OPENING_WRITE.parse({
    id: 'o1',
    wallId: 'w1',
    offset: 1.6,
    width: 0.8,
    kind: 'door',
    sillHeight: 0,
    headHeight: 2,
    hinge: 'left',
    swing: 'in',
    contactDeviceId: CONTACT,
    lockDeviceId: LOCK,
    origin: HAND,
    ...patch,
  });

describe('kinds', () => {
  it('turns a door into a wide window centred on the same spot and drops the lock', () => {
    expect(kindOps('f1', opening(), wall, 'wide_window')).toEqual([
      {
        op: 'update',
        kind: 'opening',
        floorId: 'f1',
        id: 'o1',
        patch: { kind: 'window', lockDeviceId: null },
      },
      {
        op: 'update',
        kind: 'opening',
        floorId: 'f1',
        id: 'o1',
        patch: { width: 1.8, offset: 1.1 },
      },
    ]);
  });

  it('reads a wide window back and narrows it to a window without touching links', () => {
    const wide = opening({ kind: 'window', width: 1.8, offset: 1.1, lockDeviceId: null });
    expect(choiceOf(wide)).toBe('wide_window');
    expect(kindOps('f1', wide, wall, 'window')).toEqual([
      { op: 'update', kind: 'opening', floorId: 'f1', id: 'o1', patch: { width: 1, offset: 1.5 } },
    ]);
    expect(kindOps('f1', wide, wall, 'wide_window')).toEqual([]);
  });

  it('unlinks the sensor and the lock when it becomes a plain opening', () => {
    expect(kindOps('f1', opening(), wall, 'opening')[0]).toMatchObject({
      patch: { kind: 'opening', contactDeviceId: null, lockDeviceId: null },
    });
    expect(kindOps('f1', opening(), wall, 'sliding_door')[0]).toMatchObject({
      patch: { kind: 'sliding_door' },
    });
  });
});

describe('families and measures', () => {
  it('switches the family only when it changes and keeps the door kinds in the door family', () => {
    expect(familyOf('sliding_door')).toBe('door');
    expect(familyOps('f1', opening({ kind: 'pocket_door' }), wall, 'door')).toEqual([]);
    expect(familyOps('f1', opening(), wall, 'window')[0]).toMatchObject({
      patch: { kind: 'window', lockDeviceId: null },
    });
    expect(familyKinds('window').map((kind) => kind.value)).toEqual(['window', 'wide_window']);
    expect(familyKinds('opening')).toEqual([]);
  });

  it('sets the height from the sill and slides with offset and width together', () => {
    const window = opening({ kind: 'window', sillHeight: 0.9, headHeight: 2.1 });
    expect(openingHeightOp('f1', window, 1)).toMatchObject({ patch: { headHeight: 1.9 } });
    expect(openingHeightOp('f1', opening(), 2)).toBeNull();
    expect(slideOp('f1', opening(), { offset: 1.6, width: 0.8 })).toBeNull();
    expect(slideOp('f1', opening(), { offset: 2, width: 1 })).toMatchObject({
      patch: { offset: 2, width: 1 },
    });
  });

  it('lists only devices with the linked capability, by name', () => {
    const devices = [
      { id: 'b', label: 'Back door', capabilities: [{ key: 'contact' }] },
      { id: 'a', label: 'Attic', capabilities: [{ key: 'contact' }] },
      { id: 'l', label: 'Lock', capabilities: [{ key: 'lock' }] },
    ];
    expect(linkCandidates(devices, 'contactDeviceId').map((device) => device.id)).toEqual([
      'a',
      'b',
    ]);
    expect(linkOp('f1', opening(), 'lockDeviceId', LOCK)).toBeNull();
  });
});

describe('opens', () => {
  it('defaults a window to side hung and only hinged leaves swing', () => {
    expect(windowOpens(opening({ kind: 'window' }))).toBe('side_hung');
    expect(swings(opening({ kind: 'window', opens: 'tilt_turn' }))).toBe(true);
    expect(swings(opening({ kind: 'window', opens: 'fixed' }))).toBe(false);
    expect(swings(opening({ kind: 'sliding_door' }))).toBe(false);
    expect(swings(opening({ kind: 'double_door' }))).toBe(true);
  });
});

describe('live state in the pickers', () => {
  const device = { id: CONTACT, online: true };

  it('shows the sensor reading now, and never guesses one', () => {
    expect(linkStatus('contactDeviceId', device, true).text).toBe('Open now');
    expect(linkStatus('contactDeviceId', device, false)).toMatchObject({
      text: 'Closed now',
      tone: 'positive',
    });
    expect(linkStatus('contactDeviceId', device, null).text).toBe('No reading yet');
    expect(linkStatus('contactDeviceId', { ...device, online: false }, true).text).toBe('Offline');
    expect(linkStatus('lockDeviceId', device, true).text).toBe('Locked now');
    expect(linkStatus('lockDeviceId', device, false).tone).toBe('warning');
  });

  it('names the plain choice by kind', () => {
    expect(plainText('contactDeviceId', 'window')).toBe('None, a plain window');
    expect(plainText('contactDeviceId', 'door')).toBe('None, a plain door');
    expect(plainText('lockDeviceId', 'door')).toBe('None, no lock');
  });
});

interface Panel {
  readonly current: () => HomeMapOpening;
  readonly render: () => void;
}

function panel(start: HomeMapOpening, readOnly = false): Panel {
  let current = start;
  const apply = (ops: readonly HomeMapOp[]): void => {
    for (const op of ops) {
      if (op.op === 'update') current = HOME_MAP_OPENING_WRITE.parse({ ...current, ...op.patch });
    }
  };
  const render = (): void => {
    seen.length = 0;
    const floor = HOME_MAP_FLOOR.parse({
      ...{ id: 'f1', name: 'Ground', level: 0, elevation: 0, ceilingHeight: 2.6 },
      ...{ rooms: [], walls: [wall], openings: [current], objects: [], placements: [] },
      annotations: [],
    });
    const context = {
      ...{ mode: 'openings' as const, floor, state: INITIAL_WALLS_OPENINGS, readOnly },
      dispatch: (): void => undefined,
      edit: apply,
    } as const;
    renderToStaticMarkup(createElement(OpeningInspector, { context, opening: current, wall }));
  };
  return { current: () => current, render };
}

const isPress = (value: unknown): value is () => void => typeof value === 'function';

const isChange = (value: unknown): value is (cm: number) => void => typeof value === 'function';

function press(kind: string, label: unknown): void {
  const found = seen.find((item) => item.kind === kind && item.props.label === label);
  const onPress = found?.props.onPress;
  if (!isPress(onPress)) throw new Error(String(label));
  onPress();
}

const labels = (kind: string): readonly unknown[] =>
  seen.filter((item) => item.kind === kind).map((item) => item.props.label);

const plain = { contactDeviceId: null, lockDeviceId: null } as const;

describe('the inspector panel', () => {
  beforeEach(() => {
    seen.length = 0;
  });

  it('links a contact sensor and a lock, and shows only matching devices', () => {
    const tool = panel(opening(plain));
    tool.render();
    const rows = seen.filter((item) => item.kind === 'ListRow').map((item) => item.props);
    expect(rows.map((row) => [row.title, row['subtitle']])).toEqual([
      ['Hall door', 'Closed now'],
      ['None, a plain door', 'Always drawn closed'],
      ['Front lock', 'Locked now'],
      ['None, no lock', undefined],
    ]);
    const pick = (title: string): void => {
      const onPress = rows.find((item) => item.title === title)?.onPress;
      if (!isPress(onPress)) throw new Error(title);
      onPress();
    };
    pick('Hall door');
    pick('Front lock');
    expect(tool.current()).toMatchObject({ contactDeviceId: CONTACT, lockDeviceId: LOCK });
  });

  it('shows Door, Window and Opening with Width, Height and From left', () => {
    const tool = panel(opening(plain));
    tool.render();
    const kind = seen.find((item) => item.kind === 'Segmented' && item.props.label === 'Kind');
    expect(kind?.props['options']).toEqual([
      { value: 'door', label: 'Door' },
      { value: 'window', label: 'Window' },
      { value: 'opening', label: 'Opening' },
    ]);
    expect(labels('Stepper')).toEqual(['Width', 'Height', 'From left']);
    const from = seen.find((item) => item.kind === 'Stepper' && item.props.label === 'From left');
    const change = from?.props['onChange'];
    if (!isChange(change)) throw new Error('no From left');
    change(250);
    expect(tool.current().offset).toBeCloseTo(2.5);
  });

  it('offers no lock for a window and changes nothing while read only', () => {
    const tool = panel(opening({ ...plain, kind: 'window', sillHeight: 0.9, headHeight: 2.1 }));
    tool.render();
    const titles = seen.filter((item) => item.kind === 'ListRow').map((item) => item.props.title);
    expect(titles).toEqual(['Hall door', 'None, a plain window']);
    expect(labels('Stepper')).toEqual(['Width', 'Height', 'From left', 'Above floor']);
    panel(opening(plain), true).render();
    const sliding = seen.find(
      (item) => item.kind === 'Interactive' && item.props.label === 'Sliding door',
    );
    expect(sliding?.props['disabled']).toBe(true);
    const steppers = seen.filter((item) => item.kind === 'Stepper');
    expect(steppers.map((item) => item.props['disabled'])).toEqual([true, true, true]);
  });

  it('sets how a window opens and hides the hinge for a sliding window', () => {
    const tool = panel(opening({ ...plain, kind: 'window', sillHeight: 0.9, headHeight: 2.1 }));
    tool.render();
    press('Interactive', 'Sliding');
    expect(tool.current().opens).toBe('sliding');
    tool.render();
    expect(labels('Segmented')).toEqual(['Kind']);
    press('Interactive', 'Wide window');
    expect(tool.current()).toMatchObject({ kind: 'window', width: 1.8 });
  });
});
