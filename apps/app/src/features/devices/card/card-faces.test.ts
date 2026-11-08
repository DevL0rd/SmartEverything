import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameClass } from '../../../components/widget-board';
import { useInActionBand } from '../../../components/widget-board/band-context';
import { deviceFixture } from '../../../store/device-fixture';
import { GenericFace } from './card-faces';

interface Box {
  readonly width: number;
  readonly height: number;
}

interface ControlProps {
  readonly box: Box;
  readonly dense: boolean;
  readonly onLayout?: (event: { readonly nativeEvent: { readonly layout: Box } }) => void;
}

interface SeenFace {
  visuals: { readonly size: string; readonly px: number | undefined }[];
  controls: ControlProps | null;
  controlsInBand: boolean | null;
  bandItems: boolean | null;
}

const face = vi.hoisted((): SeenFace => ({
  visuals: [],
  controls: null,
  controlsInBand: null,
  bandItems: null,
}));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children }: { readonly children?: ReactNode }): ReactNode => children,
}));

vi.mock('./card-parts', () => ({
  Facts: (): null => null,
  Header: (): null => null,
  Names: (): null => null,
  OfflineChip: (): null => null,
  Trend: (): null => null,
}));

vi.mock('./stage', () => ({
  Visual: ({ size, px }: { readonly size: string; readonly px?: number }): null => {
    face.visuals.push({ size, px });
    return null;
  },
}));

vi.mock('./card-controls', () => ({
  ControlsArea: (props: ControlProps): null => {
    face.controls = props;
    face.controlsInBand = useInActionBand();
    return null;
  },
}));

vi.mock('../faces/band-actions', () => ({
  DeviceBandItems: (): null => {
    face.bandItems = useInActionBand();
    return null;
  },
}));

let root: Root;

beforeEach(() => {
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
  face.visuals = [];
  face.controls = null;
  face.controlsInBand = null;
  face.bandItems = null;
});

function renderFace(cls: FrameClass): void {
  act(() => {
    root.render(createElement(GenericFace, { device: deviceFixture(0), cls }));
  });
}

function layOutControls(width: number, height: number): void {
  const onLayout = face.controls?.onLayout;
  if (onLayout === undefined) throw new Error('The card must measure its controls slot');
  act(() => {
    onLayout({ nativeEvent: { layout: { width, height } } });
  });
}

describe('generic device cards', () => {
  it.each([
    { cls: 'xs', px: 96 },
    { cls: 'm', px: 96 },
    { cls: 'w', px: 96 },
    { cls: 'l', px: 128 },
    { cls: 'xl', px: 128 },
  ] as const)('shows one $px px art square at class $cls', ({ cls, px }) => {
    renderFace(cls);
    expect(face.visuals).toEqual([{ size: 'card', px }]);
  });

  it.each(['s', 'm', 'w', 'l', 'xl'] as const)(
    'puts power and actions in the action band and controls outside it at class %s',
    (cls) => {
      renderFace(cls);
      expect(face.bandItems).toBe(true);
      expect(face.controlsInBand).toBe(false);
    },
  );

  it.each([
    { cls: 'm', dense: true },
    { cls: 'w', dense: true },
    { cls: 'l', dense: false },
    { cls: 'xl', dense: false },
  ] as const)('labels the controls densely only in short tiers at $cls', ({ cls, dense }) => {
    renderFace(cls);
    expect(face.controls?.dense).toBe(dense);
  });

  it('fits controls to their measured slot instead of a fixed count', () => {
    renderFace('l');
    expect(face.controls?.box).toEqual({ width: 0, height: 0 });
    expect(face.controls).not.toHaveProperty('max');

    layOutControls(253.9, 126.8);
    expect(face.controls?.box).toEqual({ width: 253, height: 126 });

    layOutControls(253.9, 74.6);
    expect(face.controls?.box).toEqual({ width: 253, height: 74 });
  });
});
