import { z } from 'zod';
import type { Ref } from 'react';
import type { DOMImperativeFactory, DOMProps } from 'expo/dom';
import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { liveModelHash } from './model-cache';
import type { LiveViewModel } from './renderer-core';

type WireMessage = DOMImperativeFactory[string];

const NAME = z.string().min(1);

const MODEL_KEY = z.strictObject({
  specHash: NAME,
  lod: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  finish: NAME.nullable(),
  params: z.record(z.string(), z.number()),
});

const WIRE_VIEW = z.strictObject({
  id: NAME,
  specKey: NAME,
  model: MODEL_KEY,
  view: z.enum(['tile', 'card', 'hero']),
  theme: z.enum(['light', 'dark']),
  signals: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
  reduced: z.boolean(),
  inspect: z
    .strictObject({ yaw: z.number(), pitch: z.number(), zoom: z.number().positive() })
    .optional(),
});

const RECT = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const PLACEMENT = z.strictObject({ rect: RECT, clip: RECT });

export const LIVE_SYNC = z.strictObject({
  generation: z.number().int().nonnegative(),
  specs: z.record(z.string(), MODEL_SPEC),
  views: z.array(WIRE_VIEW),
});

export type LiveSync = z.infer<typeof LIVE_SYNC>;

export const LIVE_PLACE = z.strictObject({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  dpr: z.number().positive(),
  placements: z.record(z.string(), PLACEMENT),
});

export type LivePlace = z.infer<typeof LIVE_PLACE>;

export const LIVE_MESSAGE = z.tuple([z.string()]);

export const LIVE_PAINT = z.tuple([z.number().int().nonnegative(), z.array(NAME)]);

export interface LiveOverlayHandle extends DOMImperativeFactory {
  readonly sync: WireMessage;
  readonly place: WireMessage;
}

export interface LiveOverlayDomProps {
  readonly ref: Ref<LiveOverlayHandle>;
  readonly onReady: () => Promise<void>;
  readonly onDrawn: (generation: number, ids: readonly string[]) => Promise<void>;
  readonly onLost: (cause: string) => Promise<void>;
  readonly onUnavailable: (detail: string) => Promise<void>;
  readonly dom?: DOMProps;
}

export function specKeyOf(view: LiveViewModel): string {
  return liveModelHash(view.model);
}

export function activeSpecKeys(views: readonly LiveViewModel[]): Set<string> {
  return new Set(views.map(specKeyOf));
}

type WireView = z.infer<typeof WIRE_VIEW>;

function wireSignals(view: LiveViewModel): WireView['signals'] {
  const signals: Record<string, WireView['signals'][string]> = {};
  for (const [name, value] of Object.entries(view.signals)) {
    if (value !== undefined) signals[name] = value;
  }
  return signals;
}

export function wireSync(
  generation: number,
  views: readonly LiveViewModel[],
  sent: ReadonlySet<string>,
): LiveSync {
  const specs: Record<string, ModelSpec> = {};
  const wire = views.map((view): WireView => {
    const specKey = specKeyOf(view);
    if (!sent.has(specKey)) specs[specKey] = view.spec;
    const { id, model, theme, reduced, inspect } = view;
    const signals = wireSignals(view);
    const wired = { id, specKey, model: { ...model }, view: view.view, theme, signals, reduced };
    return inspect === undefined ? wired : { ...wired, inspect: { ...inspect } };
  });
  return { generation, specs, views: wire };
}

export function readSync(sync: LiveSync, known: Map<string, ModelSpec>): LiveViewModel[] {
  const active = new Set(sync.views.map(({ specKey }) => specKey));
  for (const key of known.keys()) {
    if (!active.has(key)) known.delete(key);
  }
  for (const [key, spec] of Object.entries(sync.specs)) known.set(key, spec);
  return sync.views.flatMap((view) => {
    const spec = known.get(view.specKey);
    if (spec === undefined) return [];
    const { id, model, theme, signals, reduced, inspect } = view;
    const read = { id, spec, model, view: view.view, theme, signals, reduced };
    return [inspect === undefined ? read : { ...read, inspect }];
  });
}

export type LivePlacement = z.infer<typeof PLACEMENT>;

export function placementOf(box: readonly number[]): LivePlacement {
  const [x = 0, y = 0, width = 0, height = 0, ...area] = box;
  const [areaX = x, areaY = y, areaWidth = width, areaHeight = height] = area;
  return {
    rect: { x, y, width, height },
    clip: { x: areaX, y: areaY, width: areaWidth, height: areaHeight },
  };
}
