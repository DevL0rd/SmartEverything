import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { VACUUM_STATUS_TABLE } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { FrameClass, WidgetFrameBox } from '../../../components/widget-board';
import { deviceFixture } from '../../../store/device-fixture';
import { vacuumChipOf } from './model/phase-chip';

interface Props {
  readonly children?: ReactNode;
  readonly [key: string]: unknown;
}

interface Seen {
  readonly kind: string;
  readonly props: Props;
}

const seen = vi.hoisted(() => new Array<Seen>());

interface World {
  facts: unknown;
  screen: { visible: boolean; focused: boolean; foreground: boolean };
  reads: string[];
}

const world = vi.hoisted((): World => ({
  facts: null,
  screen: { visible: true, focused: true, foreground: true },
  reads: [],
}));

function stub(kind: string): (props: Props) => ReactNode {
  return (props) => {
    seen.push({ kind, props });
    return props.children ?? null;
  };
}

vi.mock('react-native', () => ({ View: stub('View') }));
vi.mock('../../../components/status-chip', () => ({ StatusChip: stub('StatusChip') }));
vi.mock('../../../components/widget-board/action-band', () => ({ ActionBand: stub('ActionBand') }));
vi.mock('../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../components/select', () => ({ Select: stub('Select') }));
vi.mock('../../../design/animation-gate', () => ({
  useScreenLive: (): { focused: boolean; foreground: boolean } => {
    world.reads.push('screen');
    return world.screen;
  },
}));
vi.mock('../../../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: () => void } => ({
    visible: world.screen.visible,
    onLayout: (): void => undefined,
  }),
}));
vi.mock('../../../store/clock', () => ({
  useMinute: (): number => {
    world.reads.push('minute');
    return 0;
  },
}));
vi.mock('../../../store/selectors', () => ({
  useSettings: (): { time_zone: null } => ({ time_zone: null }),
}));
vi.mock('../../device-visuals', () => ({ DeviceVisual: stub('DeviceVisual'), SIZE_CLASS: {} }));
vi.mock('../card/wide-card', () => ({ WIDE_VISUAL_PX: { m: 96, w: 96, l: 128, xl: 128 } }));
vi.mock('./data/use-vacuum-pose', () => ({
  useVacuumPose: (): { ok: true; value: null } => {
    world.reads.push('pose');
    return { ok: true, value: null };
  },
}));
vi.mock('./data/cleans-query', () => ({
  useVacuumCleans: (): { cleans: readonly never[] } => {
    world.reads.push('cleans');
    return { cleans: [] };
  },
}));
vi.mock('./data/use-vacuum-schedules', () => ({ useNextCleanDay: (): null => null }));
vi.mock('./face-facts', () => ({ useFaceFacts: (): unknown => world.facts }));
vi.mock('./face-parts', () => ({
  ActionRow: stub('ActionRow'),
  AwakeStage: stub('AwakeStage'),
  Battery: stub('Battery'),
  Figures: stub('Figures'),
  PhaseText: stub('PhaseText'),
  RestNotes: stub('RestNotes'),
  RestStage: stub('RestStage'),
  RoomChips: stub('RoomChips'),
  StageFrame: stub('StageFrame'),
  slotOf: (layout: string, wide: boolean): string | null => {
    if (layout === 'tile') {
      return null;
    }
    if (layout === 'row') {
      return wide ? 'w' : 'm';
    }
    return layout === 'side' && wide ? 'side' : 'stack';
  },
}));
vi.mock('./components/station-stop', () => ({ stationStopOf: (): null => null }));
vi.mock('./components/link-badge', () => ({ LinkBadge: stub('LinkBadge') }));

const { VacuumFace } = await import('./faces');

function statusOf(phase: string): number {
  const row = VACUUM_STATUS_TABLE.find((entry) => entry.phase === phase);
  if (row === undefined) {
    throw new Error(`No status for ${phase}`);
  }
  return row.value;
}

function factsOf(
  phase: string,
  online = true,
  extra: Record<string, boolean | number | string> = {},
): void {
  const values = { vacuum_status: statusOf(phase), battery: 64, ...extra };
  world.facts = {
    vacuum: { snapshot: { values, online } },
    chip: vacuumChipOf(values, online),
    scene: null,
    job: null,
    battery: 64,
    links: null,
    fault: null,
  };
}

function frameOf(width: number, height: number): WidgetFrameBox {
  return { width, height, idiom: 'touch' };
}

function render(
  cls: FrameClass,
  width: number,
  options?: { readonly vacuumView: '3d' | 'camera' },
): void {
  seen.length = 0;
  world.reads.length = 0;
  const device = deviceFixture(0, { kind: 'vacuum', name: 'Robot' });
  renderToStaticMarkup(
    createElement(VacuumFace, {
      device,
      cls,
      frame: frameOf(width, 140),
      size: 'M',
      ...(options === undefined ? {} : { options }),
    }),
  );
}

function kinds(): readonly string[] {
  return seen.map((entry) => entry.kind);
}

function stage(): Props {
  const found = seen.find((entry) => entry.kind === 'AwakeStage');
  if (found === undefined) {
    throw new Error('No awake stage was drawn');
  }
  return found.props;
}

describe('the vacuum widget face', () => {
  it('carries the room link badge on every staged face and not on the small tile', () => {
    factsOf('charging');
    for (const [cls, width] of [
      ['m', 348],
      ['w', 900],
      ['xl', 348],
    ] as const) {
      render(cls, width);
      expect(seen.filter((entry) => entry.kind === 'LinkBadge')).toHaveLength(1);
    }
    render('s', 160);
    expect(kinds()).not.toContain('LinkBadge');
  });

  it('shows the map for a robot that is cleaning, in 3D while on screen', () => {
    factsOf('cleaning');
    render('m', 348);
    expect(kinds()).toContain('AwakeStage');
    expect(kinds()).not.toContain('RestStage');
    expect(stage()).toMatchObject({ slot: 'm', view: '3d', cameraLive: false, error: false });
  });

  it('shows the still map when the face is off screen, unfocused or in the background', () => {
    factsOf('cleaning');
    for (const screen of [
      { visible: false, focused: true, foreground: true },
      { visible: true, focused: false, foreground: true },
      { visible: true, focused: true, foreground: false },
    ]) {
      world.screen = screen;
      render('m', 348);
      expect(stage()).toMatchObject({ view: 'still' });
    }
    world.screen = { visible: true, focused: true, foreground: true };
  });

  it('follows the main view option', () => {
    factsOf('cleaning');
    render('m', 348, { vacuumView: '3d' });
    expect(stage()).toMatchObject({ view: '3d', cameraLive: false });
    render('m', 348, { vacuumView: 'camera' });
    expect(stage()).toMatchObject({ view: '3d', cameraLive: false });
  });

  it('treats a docked robot that is awake like a working one', () => {
    factsOf('charging', true, { vacuum_asleep: false });
    render('w', 1140);
    expect(stage()).toMatchObject({ slot: 'w', view: '3d' });
  });

  it('shows the device graphic and no map for a docked robot that is asleep', () => {
    factsOf('charging', true, { vacuum_asleep: true });
    render('m', 348);
    expect(kinds()).toContain('RestStage');
    expect(kinds()).not.toContain('AwakeStage');
  });

  it('draws the rest graphic as the model of this robot in the stage slot', () => {
    factsOf('charging', true, { vacuum_asleep: true });
    render('m', 348);
    const rest = seen.find((entry) => entry.kind === 'RestStage');
    expect(rest?.props['slot']).toBe('m');
    expect(rest?.props['device']).toMatchObject({ kind: 'vacuum', name: 'Robot' });
  });

  it('marks the stage when the robot has an error', () => {
    factsOf('error', true, { vacuum_asleep: false });
    render('l', 348);
    expect(stage()).toMatchObject({ slot: 'stack', error: true });
  });

  it('shows the graphic for a robot that is not reachable and offers no actions', () => {
    factsOf('cleaning', false);
    render('m', 348);
    expect(kinds()).toContain('RestStage');
    expect(kinds()).not.toContain('AwakeStage');
    expect(kinds()).not.toContain('RestNotes');
  });

  it('adds pickable room chips on the stacked and side layouts while it can start', () => {
    factsOf('charging', true, { vacuum_asleep: true });
    render('xl', 1140);
    expect(typeof seen.find((entry) => entry.kind === 'RoomChips')?.props['onPick']).toBe(
      'function',
    );
    render('m', 348);
    expect(kinds()).not.toContain('RoomChips');
  });

  it('keeps read-only room chips on the cleaning XL face', () => {
    factsOf('cleaning');
    render('xl', 1140);
    const chips = seen.find((entry) => entry.kind === 'RoomChips');
    expect(chips).toBeDefined();
    expect(chips?.props['onPick']).toBeUndefined();
  });

  it('stacks an XL face on a narrow frame and puts the stage beside the panel on a wide one', () => {
    factsOf('cleaning');
    render('xl', 348);
    expect(stage()).toMatchObject({ slot: 'stack' });
    render('xl', 1140);
    expect(stage()).toMatchObject({ slot: 'side' });
  });

  it('gives the M face one icon action and the wide faces a labelled row', () => {
    factsOf('cleaning');
    render('m', 348);
    expect(seen.find((entry) => entry.kind === 'ActionRow')?.props['look']).toBe('icon');
    render('w', 1140);
    expect(seen.find((entry) => entry.kind === 'ActionRow')?.props['look']).toBe('compact');
  });

  it('gives the short desktop M box the staged row face with a battery and an action', () => {
    factsOf('cleaning');
    render('xs', 520);
    expect(kinds()).toContain('AwakeStage');
    expect(kinds()).toContain('Battery');
    expect(seen.find((entry) => entry.kind === 'ActionRow')?.props['look']).toBe('icon');
  });

  it('draws the small tile without a map', () => {
    factsOf('cleaning');
    render('s', 150);
    expect(kinds()).toContain('DeviceVisual');
    expect(kinds()).not.toContain('AwakeStage');
  });

  it('reads the clock, the last clean, the pose and the screen only for parts it draws', () => {
    factsOf('charging', true, { vacuum_asleep: true });
    render('m', 348);
    expect(world.reads).toEqual([]);
    render('w', 900);
    expect(world.reads).toEqual(['cleans', 'minute']);
    render('xl', 348);
    expect(world.reads).toEqual(['cleans', 'minute', 'pose']);
    factsOf('cleaning');
    render('m', 348);
    expect(world.reads).toEqual(['screen']);
  });
});
