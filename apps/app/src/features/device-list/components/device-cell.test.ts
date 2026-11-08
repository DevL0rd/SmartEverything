import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceFixture } from '../../../store/device-fixture';

interface Drawn {
  readonly kind: string;
  readonly size: string;
  readonly width: number;
  readonly height: number;
}

const probe = vi.hoisted(() => ({ drawn: new Array<Drawn>(), width: 'compact' }));

vi.mock('@smarteverything/domain', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isCamera: (device: { readonly id: string }): boolean => device.id === 'cam',
}));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { readonly width: string } => ({ width: probe.width }),
}));
vi.mock('../../devices', () => ({
  DeviceSpotlightWidget: (props: {
    readonly size: string;
    readonly frame: { readonly width: number; readonly height: number };
  }): null => {
    probe.drawn.push({
      kind: 'spotlight',
      size: props.size,
      width: props.frame.width,
      height: props.frame.height,
    });
    return null;
  },
}));
vi.mock('../../home', () => ({
  SPOTLIGHT_WIDGET: {
    sizes: { compact: ['M', 'W', 'XL'], medium: ['M', 'W', 'XL'], expanded: ['M', 'W', 'XL'] },
    defaultSize: 'M',
  },
}));
vi.mock('../../cameras', () => ({
  CAMERA_WIDGETS: [
    {
      type: 'camera',
      sizes: { compact: ['M'], medium: ['M', 'W'], expanded: ['M', 'W'] },
      defaultSize: 'M',
      render: (props: {
        readonly size: string;
        readonly frame: { readonly width: number; readonly height: number };
      }): null => {
        probe.drawn.push({
          kind: 'camera',
          size: props.size,
          width: props.frame.width,
          height: props.frame.height,
        });
        return null;
      },
    },
  ],
}));
vi.mock('../../../components/widget-board', () => ({
  boardClassOf: (width: string): string => width,
  renderWidget: (
    definition: { readonly render: (props: unknown) => unknown },
    props: unknown,
  ): unknown => definition.render(props),
}));

const { DeviceCell, FilledDeviceCell } = await import('./device-cell');

const FILL = { width: 358, height: 480, idiom: 'touch' } as const;

let root: Root;

beforeEach(() => {
  probe.drawn.length = 0;
  probe.width = 'compact';
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

function draw(element: Parameters<Root['render']>[0]): void {
  act(() => {
    root.render(element);
  });
}

describe('the filled device cell', () => {
  it('draws a device at its largest face in the whole space left', () => {
    draw(createElement(FilledDeviceCell, { device: deviceFixture(0), frame: FILL }));
    expect(probe.drawn).toEqual([{ kind: 'spotlight', size: 'XL', width: 358, height: 480 }]);
  });

  it('draws a camera at the largest size its board offers', () => {
    const camera = deviceFixture(1, { id: 'cam' });
    draw(createElement(FilledDeviceCell, { device: camera, frame: FILL }));
    probe.width = 'medium';
    draw(createElement(FilledDeviceCell, { device: camera, frame: { ...FILL, width: 700 } }));
    expect(probe.drawn).toEqual([
      { kind: 'camera', size: 'M', width: 358, height: 480 },
      { kind: 'camera', size: 'W', width: 700, height: 480 },
    ]);
  });

  it('leaves the normal cell at size M', () => {
    draw(createElement(DeviceCell, { device: deviceFixture(0), frame: FILL }));
    expect(probe.drawn).toEqual([{ kind: 'spotlight', size: 'M', width: 358, height: 480 }]);
  });
});
