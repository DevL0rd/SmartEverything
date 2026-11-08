import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { DeviceKind } from '@smarteverything/domain';
import type { VisualComponent, VisualSize, VisualState } from '../device-visuals';
import type { Device } from '../../store/state';
import { capabilities, containerOf, DEVICE, flushFrames, STAMP, type Spec } from './cell-budget';
import {
  DeviceVisual,
  LIGHTING,
  LightingContext,
  PALETTE,
  PaletteContext,
  deviceFixture,
  cellNodes as nodes,
  toneOf,
  visualStateOf,
} from './cell-mocks';
import { treeOf } from './cell-tree';

export interface VisualCase {
  readonly kind: DeviceKind;
  readonly model?: string;
  readonly specs: readonly Spec[];
}

type Values = Readonly<Record<string, number | boolean | string>>;

export interface VisualRender {
  readonly count: number;
  readonly tree: string;
}

function visualOf(
  visual: VisualCase,
  values: Values,
): { readonly device: Device; readonly state: VisualState } {
  const device = deviceFixture(0, {
    id: DEVICE,
    kind: visual.kind,
    model: visual.model ?? 'test.model',
    capabilities: capabilities(visual.specs),
  });
  const observed = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, { value, observedAt: STAMP }]),
  );
  return { device, state: visualStateOf({ ...device, online: true }, observed) };
}

function countRender(element: ReactNode): VisualRender {
  const container = containerOf();
  const root = createRoot(container);
  nodes.count = 0;
  act(() => {
    root.render(
      createElement(
        PaletteContext,
        { value: PALETTE },
        createElement(LightingContext, { value: LIGHTING.light }, element),
      ),
    );
  });
  flushFrames();
  const rendered = { count: nodes.count, tree: treeOf(container) };
  act(() => {
    root.unmount();
  });
  return rendered;
}

export function renderVisual(
  visual: VisualCase,
  values: Values,
  size: VisualSize,
  px: 48 | 96 | 220,
): number {
  const { device, state } = visualOf(visual, values);
  return countRender(createElement(DeviceVisual, { device, size, px, state })).count;
}

export interface PartCase {
  readonly visual: VisualCase;
  readonly values: Values;
  readonly size: VisualSize;
  readonly px: number;
}

export function renderVisualPart(
  Part: VisualComponent,
  { visual, values, size, px }: PartCase,
): VisualRender {
  const { state } = visualOf(visual, values);
  return countRender(
    createElement(Part, { state, size, px, tone: toneOf(state), moving: true, reduced: false }),
  );
}
