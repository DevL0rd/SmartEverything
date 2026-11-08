import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOME_MAP_ID, type HomeMapOp, type HomeMapScan } from '@smarteverything/domain';
import type { ScanAlign as Align } from './scan-align';

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
vi.mock('../../../../components/button', () => ({ Button: stub('Button') }));
vi.mock('../../../../components/text', () => ({ Text: stub('Text') }));
vi.mock('../../../../components/icon', () => ({ Icon: stub('Icon') }));
vi.mock('../../../../components/icon-button', () => ({ IconButton: stub('IconButton') }));
vi.mock('../../../../components/interactive', () => ({ Interactive: stub('Interactive') }));
vi.mock('../../../../components/number-stepper', () => ({ NumberStepper: stub('NumberStepper') }));
vi.mock('../../../../components/slider', () => ({ Slider: stub('Slider') }));
vi.mock('../../../../components/charts/progress-bar', () => ({ ProgressBar: stub('ProgressBar') }));
vi.mock('../../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../../platform/pick-files', () => ({ pickFiles: vi.fn() }));
vi.mock('../list-editor/list-parts', () => ({ UNBOUNDED_CM: Number.MAX_SAFE_INTEGER }));
vi.mock('../../../../platform/haptics', () => ({ selectionTick: vi.fn() }));

const { ScanAlignPanel, scanAlignEdit, scanAlignNotice, scanAlignOverlay } =
  await import('./scan-align');
const { EMPTY_POINTS, REMOVE_TITLE, NO_SCAN_TEXT, SCAN_GRIP_IDS } =
  await import('./scan-align-model');
const { ScanUploads } = await import('../../data/scan-upload');

const SCAN: HomeMapScan = {
  file: { hash: 'a'.repeat(64), format: 'spz', bytes: 71_500, name: 'house.spz' },
  lod: null,
  transform: { tx: 1, ty: 2, tz: 0, yawDeg: 0, scale: 1, levelled: true },
  opacity: 0.8,
  points: [],
  residualM: 0.04,
  uploadedAt: '2026-10-25T10:00:00.000Z',
  uploadedBy: 'person-1',
};

interface AlignOptions {
  readonly scan: HomeMapScan | null;
  readonly removing?: boolean;
  readonly readOnly?: boolean;
  readonly mode?: Align['mode'];
  readonly sent?: HomeMapOp[][];
  readonly commits?: [number, readonly HomeMapOp[]][];
}

function alignOf(options: AlignOptions): Align {
  const sent = options.sent ?? [];
  const readOnly = options.readOnly ?? false;
  const { scan } = options;
  return {
    input: {
      map: { id: HOME_MAP_ID, ...(scan === null ? {} : { scan }) },
      floor: undefined,
      readOnly,
      edit: (ops): void => {
        sent.push([...ops]);
      },
      commit: (seq, ops): void => {
        options.commits?.push([seq, ops]);
      },
      uploads: new ScanUploads(() => Promise.reject(new Error('unused')), vi.fn()),
      measured: null,
    },
    scan,
    extent: { minX: 0, minY: 0, maxX: 4, maxY: 3 },
    opacity: null,
    setOpacity: vi.fn(),
    mode: options.mode ?? 'drag',
    setMode: vi.fn(),
    draft: EMPTY_POINTS,
    setDraft: vi.fn(),
    removing: options.removing ?? false,
    setRemoving: vi.fn(),
    send: (ops): void => {
      if (!readOnly) sent.push([...ops]);
    },
  };
}

function render(node: ReactNode): void {
  seen.length = 0;
  renderToStaticMarkup(node);
}

const texts = (): unknown[] =>
  seen.filter((item) => item.kind === 'Text').map((item) => item.props.children);

const button = (label: string): Props | undefined =>
  seen.find((item) => item.kind === 'Button' && item.props['label'] === label)?.props;

const call = (handler: unknown, ...args: readonly unknown[]): void => {
  if (typeof handler === 'function') Reflect.apply(handler, undefined, args);
};

const press = (props: Props | undefined): void => {
  call(props?.['onPress']);
};

beforeEach(() => {
  seen.length = 0;
});

const TAP = {
  type: 'tap',
  seq: 4,
  point: { x: 2, y: 1 },
  floorId: 'f',
  hit: { kind: 'none' },
  metresPerPx: 0.01,
} as const;

const PLACED = {
  type: 'scan',
  seq: 7,
  placement: { tx: 1.5, ty: 2, tz: 0.1, yawDeg: 15, scale: 1 },
} as const;

describe('Align realistic view panel', () => {
  it('offers the upload when the map has no scan', () => {
    render(createElement(ScanAlignPanel, { align: alignOf({ scan: null }) }));
    expect(texts()).toContain(NO_SCAN_TEXT);
    expect(button('Choose a file')).toBeDefined();
    expect(button('Remove the realistic view')).toBeUndefined();
  });

  it('shows X, Y, Turn, Scale and Lift, opacity, Keep level, the residual, Replace and Remove', () => {
    render(createElement(ScanAlignPanel, { align: alignOf({ scan: SCAN }) }));
    const steppers = seen.filter((item) => item.kind === 'NumberStepper');
    expect(steppers.map((item) => item.props['label'])).toEqual([
      'X',
      'Y',
      'Turn',
      'Scale',
      'Lift',
    ]);
    expect(steppers[0]?.props['value']).toBe(100);
    expect(seen.find((item) => item.kind === 'Slider')?.props['value']).toBe(80);
    expect(texts()).toContain('Lined up within 4 cm');
    expect(button('Replace the file')).toBeDefined();
    expect(button('Pick points')).toBeDefined();
    const chips = seen
      .filter((item) => item.kind === 'Interactive')
      .map((item) => item.props['label']);
    expect(chips).toEqual(['Keep level']);
  });

  it('turns a typed field into one setScanTransform', () => {
    const sent: HomeMapOp[][] = [];
    render(createElement(ScanAlignPanel, { align: alignOf({ scan: SCAN, sent }) }));
    const scale = seen.find(
      (item) => item.kind === 'NumberStepper' && item.props['label'] === 'Scale',
    )?.props['onChange'];
    call(scale, 150);
    expect(sent).toEqual([[{ op: 'setScanTransform', patch: { transform: { scale: 1.5 } } }]]);
  });

  it('previews the opacity on the scan while sliding and saves it on release', () => {
    const sent: HomeMapOp[][] = [];
    const align = alignOf({ scan: SCAN, sent });
    render(createElement(ScanAlignPanel, { align }));
    const slider = seen.find((item) => item.kind === 'Slider')?.props;
    call(slider?.['onChange'], 40);
    expect(align.setOpacity).toHaveBeenLastCalledWith(0.4);
    call(slider?.['onCommit'], 40);
    expect(align.setOpacity).toHaveBeenLastCalledWith(null);
    expect(sent).toEqual([[{ op: 'setScanTransform', patch: { opacity: 0.4 } }]]);
  });

  it('removes the scan only from the docked confirm row', () => {
    const sent: HomeMapOp[][] = [];
    const asking = alignOf({ scan: SCAN, sent });
    render(createElement(ScanAlignPanel, { align: asking }));
    press(button('Remove the realistic view'));
    expect(asking.setRemoving).toHaveBeenCalledWith(true);
    expect(sent).toEqual([]);
    render(createElement(ScanAlignPanel, { align: alignOf({ scan: SCAN, removing: true, sent }) }));
    expect(texts()).toContain(REMOVE_TITLE);
    press(button('Remove'));
    expect(sent).toEqual([[{ op: 'removeScan' }]]);
  });
});

describe('Align realistic view in the 3D stage', () => {
  it('puts the gizmo on the scan only when the map has one', () => {
    expect(scanAlignOverlay(alignOf({ scan: null }))).toBeNull();
    const overlay = scanAlignOverlay(alignOf({ scan: SCAN }));
    expect(overlay?.handles.map((handle) => handle.id)).toEqual(Object.values(SCAN_GRIP_IDS));
    expect(overlay?.gizmo?.centre).toEqual({ x: 3, y: 3.5, height: 0 });
  });

  it('commits a gizmo drag as one setScanTransform under the drag seq', () => {
    const commits: [number, readonly HomeMapOp[]][] = [];
    scanAlignEdit(alignOf({ scan: SCAN, commits }), PLACED);
    expect(commits).toEqual([
      [
        7,
        [
          {
            op: 'setScanTransform',
            patch: { transform: { tx: 1.5, tz: 0.1, yawDeg: 15 } },
          },
        ],
      ],
    ]);
  });

  it('settles a drag with no edit when read-only so the scene drops its preview', () => {
    const commits: [number, readonly HomeMapOp[]][] = [];
    scanAlignEdit(alignOf({ scan: SCAN, readOnly: true, commits }), PLACED);
    expect(commits).toEqual([[7, []]]);
  });

  it('takes floor taps as points only while picking points', () => {
    const idle = alignOf({ scan: SCAN });
    scanAlignEdit(idle, TAP);
    expect(idle.setDraft).not.toHaveBeenCalled();
    expect(scanAlignNotice(idle)).toBeNull();
    const picking = alignOf({ scan: SCAN, mode: 'points' });
    scanAlignEdit(picking, TAP);
    expect(picking.setDraft).toHaveBeenCalledTimes(1);
    expect(scanAlignNotice(picking)).toEqual({ text: 'Tap point 1 on the scan', tone: 'info' });
  });
});
