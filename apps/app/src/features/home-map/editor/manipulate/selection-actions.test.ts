import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HomeMapOp } from '@smarteverything/domain';
import {
  BIG,
  SOFA_ID,
  floorWith,
  idleRoomFlow,
  onlyObject,
  sofa,
  specOf,
} from '../tools/furniture-fixture';
import type { FurnitureTool } from '../tools/furniture';
import { NO_EDIT_OVERLAY } from '../../../../components/house-map/3d/map-3d-edit-protocol';

const none = (): null => null;

vi.mock('react-native', () => ({ View: none, ScrollView: none }));
vi.mock('react-native-reanimated', () => ({ default: { View: none }, FadeIn: {} }));
vi.mock('react-native-gesture-handler', () => ({ Gesture: {}, GestureDetector: none }));
vi.mock('react-native-svg', () => ({ default: none, Circle: none, G: none, Path: none }));
vi.mock('../tools/walls-openings', () => ({
  wallsOpeningsDrag: vi.fn(),
  wallsOpeningsTap: vi.fn(),
}));
vi.mock('../../../../design/size-class', () => ({ useIsPhone: (): boolean => false }));
vi.mock('../../../../store/selectors', () => ({
  useRooms: (): readonly never[] => [],
  useDevices: (): readonly never[] => [],
}));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: vi.fn() }));
vi.mock('../../../../components/icon', () => ({ Icon: none }));
vi.mock('../../../../components/text', () => ({ Text: none }));
vi.mock('../../../../components/interactive', () => ({ Interactive: none }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: none }));
vi.mock('../../../../design/motion', () => ({ useMotion: none, entering: none }));
vi.mock('../../../../design/platform', () => ({ isNative: (): boolean => true, useIdiom: none }));

const { applyOutcome, barGizmo, lookKey, useSelectionActions } =
  await import('./selection-actions');
const { menuRect } = await import('./stage-menu');

function toolOf(selected: string | null): FurnitureTool {
  const floor = floorWith([sofa()]);
  return {
    floor,
    rows: [],
    readOnly: false,
    selected: selected === SOFA_ID ? onlyObject(floor) : null,
    selectedId: selected,
    notice: null,
    notify: vi.fn(),
    specOf,
    nameOf: (): string => 'Sofa',
    roomFlow: idleRoomFlow(),
    place: vi.fn(),
    select: vi.fn(),
    send: vi.fn(),
    patch: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
}

const OP: HomeMapOp = { op: 'remove', kind: 'object', floorId: 'f', id: SOFA_ID };

describe('applyOutcome', () => {
  it('shows a blocked notice and sends nothing', () => {
    const tool = toolOf(SOFA_ID);
    applyOutcome(tool, { kind: 'blocked', notice: 'No room' });
    expect(tool.notify).toHaveBeenCalledWith('No room');
    expect(tool.send).not.toHaveBeenCalled();
  });

  it('sends the ops and clears the selection after a delete', () => {
    const tool = toolOf(SOFA_ID);
    applyOutcome(tool, { kind: 'ops', ops: [OP], select: null });
    expect(tool.send).toHaveBeenCalledWith([OP]);
    expect(tool.clear).toHaveBeenCalled();
    expect(tool.notify).toHaveBeenCalledWith(null);
  });

  it('selects the copy after a duplicate and skips empty op lists', () => {
    const tool = toolOf(SOFA_ID);
    applyOutcome(tool, { kind: 'ops', ops: [], select: 'copy' });
    expect(tool.send).not.toHaveBeenCalled();
    expect(tool.select).toHaveBeenCalledWith('copy');
  });

  it('moves a device to the chosen room through the shared room flow', () => {
    const tool = toolOf(SOFA_ID);
    const place = vi.fn();
    const moving = { ...tool, roomFlow: { ...tool.roomFlow, place } };
    applyOutcome(moving, { kind: 'placeDevice', deviceId: 'lamp', at: { x: 7, y: 1 } });
    expect(place).toHaveBeenCalledWith('lamp', { x: 7, y: 1 }, 'move');
    expect(tool.send).not.toHaveBeenCalled();
  });

  it('keeps the selection when the same object stays selected', () => {
    const tool = toolOf(SOFA_ID);
    applyOutcome(tool, { kind: 'ops', ops: [OP], select: SOFA_ID });
    expect(tool.select).not.toHaveBeenCalled();
    expect(tool.clear).not.toHaveBeenCalled();
  });
});

describe('menu anchor', () => {
  it('anchors to the selection rectangle the scene sent, or to the pressed point before it', () => {
    const rect = { x: 40, y: 60, width: 120, height: 80 };
    const at = { id: SOFA_ID, point: { x: 10, y: 20 } };
    expect(menuRect(rect, at)).toBe(rect);
    expect(menuRect(null, at)).toEqual({ x: 10, y: 20, width: 0, height: 0 });
  });

  it('keys each look by kind and value', () => {
    expect(lookKey({ kind: 'finish', value: 'oak', label: 'Oak', on: false })).toBe('finish:oak');
  });
});

describe('bar gizmo', () => {
  it('passes the mode, axes and snapping through and disables the controls with no mode', () => {
    const setMode = vi.fn();
    const manipulation = {
      gizmo: { mode: 'rotate', space: 'world', snapping: false, owner: SOFA_ID },
      modes: ['move', 'rotate', 'scale'],
      locked: false,
      overlay: null,
      notice: null,
      setMode,
      toggleSnapping: vi.fn(),
      toggleSpace: vi.fn(),
      onEdit: vi.fn(),
    } as const;
    const bar = barGizmo({ ...manipulation, overlay: { ...NO_EDIT_OVERLAY } });
    expect(bar).toMatchObject({ mode: 'rotate', space: 'world', snapping: false, disabled: false });
    bar.onMode('scale');
    expect(setMode).toHaveBeenCalledWith('scale');
    expect(barGizmo({ ...manipulation, modes: [], overlay: { ...NO_EDIT_OVERLAY } }).disabled).toBe(
      true,
    );
  });
});

describe('useSelectionActions', () => {
  function actionsOf(selected: string | null): ReturnType<typeof useSelectionActions> {
    const held: { value: ReturnType<typeof useSelectionActions> } = { value: null };
    function Probe(): ReactNode {
      held.value = useSelectionActions(toolOf(selected));
      return null;
    }
    renderToStaticMarkup(createElement(Probe));
    return held.value;
  }

  it('gives a selected room its title, floor line and Delete room action', () => {
    const actions = actionsOf(BIG);
    expect(actions?.id).toBe(BIG);
    expect(actions?.target.kind).toBe('room');
    expect(actions?.title).toBe('Living room');
    expect(actions?.room).toBe('Ground');
    expect(actions?.actionsFor('menu').map((action) => action.label)).toEqual(['Delete room']);
  });

  it('gives a selected object its object actions and nothing for no selection', () => {
    expect(actionsOf(SOFA_ID)?.target.kind).toBe('object');
    expect(actionsOf(null)).toBeNull();
  });
});
