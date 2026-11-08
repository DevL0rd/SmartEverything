import { act, createElement, Fragment, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';
import { packRows } from '../model/row-pack';
import type { Device } from '../../../store/state';
import type { WidgetFrameBox } from '../../../components/widget-board';
import type { CellSize } from './grid-row';

const probe = vi.hoisted(() => ({
  mounted: 0,
  retired: 0,
  rowHeight: 0,
  frames: new Map<string, WidgetFrameBox>(),
}));

function pass({ children }: { readonly children?: ReactNode }): ReactNode {
  return createElement(Fragment, null, children);
}

vi.mock('react-native', () => ({
  View: pass,
}));
vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { readonly width: number } => ({ width: 412 }),
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): string => 'touch' }));
vi.mock('../../../design/theme', () => ({ useThemeSetting: (): string => 'comfortable' }));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { readonly width: string } => ({ width: 'compact' }),
}));
vi.mock('../../models', () => ({
  ScrollModelLayer: ({
    children,
    style,
  }: {
    readonly children: ReactNode;
    readonly style: { readonly height: number };
  }): ReactNode => {
    probe.rowHeight = style.height;
    useEffect(() => {
      probe.mounted += 1;
      return (): void => {
        probe.retired += 1;
      };
    }, []);
    return children;
  },
}));
vi.mock('./device-cell', () => ({
  DeviceCell: ({
    device,
    frame,
  }: {
    readonly device: Device;
    readonly frame: WidgetFrameBox;
  }): null => {
    probe.frames.set(device.id, frame);
    return null;
  },
}));

const { GridRowView, useCellSize } = await import('./grid-row');
const { tierHeight } = await import('../../../components/widget-board/tier');
const { RoomDeviceGrid } = await import('./room-device-grid');

const CELL: CellSize = {
  gap: 12,
  height: 172,
  fill: 356,
  gutter: 16,
  idiom: 'touch',
  pad: 16,
  perRow: 1,
  column: 360,
};

let root: Root;

beforeEach(() => {
  probe.mounted = 0;
  probe.retired = 0;
  probe.rowHeight = 0;
  probe.frames.clear();
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
});

function show(element: ReactNode): void {
  act(() => {
    root.render(element);
  });
}

describe('device row preview ownership', () => {
  it('keeps the room preview inside the room card row', () => {
    show(createElement(RoomDeviceGrid, { devices: [deviceFixture(1)] }));
    expect(probe).toMatchObject({ mounted: 1, retired: 0 });
  });

  it('retires the canvas when the same holder receives another row', () => {
    const [first, second] = packRows([deviceFixture(1), deviceFixture(2)], CELL.perRow);
    if (first === undefined || second === undefined) throw new Error('Expected two packed rows');
    show(createElement(GridRowView, { row: first, cell: CELL }));
    show(createElement(GridRowView, { row: first, cell: { ...CELL, column: 400 } }));
    expect(probe).toMatchObject({ mounted: 1, retired: 0 });
    show(createElement(GridRowView, { row: second, cell: CELL }));
    expect(probe).toMatchObject({ mounted: 2, retired: 1 });
  });
});

describe('ordinary device row geometry', () => {
  it('uses the same frame for a mixed row and a one-device row', () => {
    const [mixed] = packRows([deviceFixture(1), deviceFixture(2)], 2);
    const [single] = packRows([deviceFixture(1)], 1);
    if (mixed === undefined || single === undefined) throw new Error('Expected packed rows');
    show(createElement(GridRowView, { row: mixed, cell: { ...CELL, perRow: 2 } }));
    expect(probe.rowHeight).toBe(172);
    expect([...probe.frames]).toEqual([
      ['dev-1', { width: 328, height: 140, idiom: 'touch', surface: 'device-grid' }],
      ['dev-2', { width: 328, height: 140, idiom: 'touch', surface: 'device-grid' }],
    ]);
    probe.frames.clear();
    show(createElement(GridRowView, { row: single, cell: { ...CELL, column: 240 } }));
    expect(probe.rowHeight).toBe(172);
    expect([...probe.frames]).toEqual([
      ['dev-1', { width: 208, height: 140, idiom: 'touch', surface: 'device-grid' }],
    ]);
  });

  it('takes the Home M tier height for cells and the XL tier height for a lone result', () => {
    let measured: CellSize | null = null;
    function Probe(): null {
      measured = useCellSize();
      return null;
    }
    show(createElement(Probe));
    expect(measured).toMatchObject({
      height: tierHeight('M', 'touch', 'comfortable'),
      fill: tierHeight('XL', 'touch', 'comfortable'),
      pad: 16,
    });
  });
});
