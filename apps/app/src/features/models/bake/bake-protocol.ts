import { z } from 'zod';
import type { Ref } from 'react';
import type { DOMImperativeFactory, DOMProps } from 'expo/dom';
import { MODEL_SPEC } from '@smarteverything/domain';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';

type WireMessage = DOMImperativeFactory[string];

export const BAKE_VIEWS = ['tile', 'card', 'hero'] as const;

export const BAKE_THEMES = ['light', 'dark'] as const;

export const BAKE_DPR_BUCKETS = [2, 3] as const;

export type BakeView = (typeof BAKE_VIEWS)[number];

export type BakeTheme = (typeof BAKE_THEMES)[number];

export type BakeDpr = (typeof BAKE_DPR_BUCKETS)[number];

export function dprBucket(devicePixelRatio: number): BakeDpr {
  return devicePixelRatio > 2 ? 3 : 2;
}

const NAME = z.string().min(1);

export const BAKE_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('keyframe'), state: NAME }),
  z.strictObject({ kind: z.literal('shot'), shotId: NAME }),
]);

export type BakeTarget = z.infer<typeof BAKE_TARGET>;

export const BAKE_KEY = z.strictObject({
  specHash: NAME,
  bakeVersion: z.number().int().nonnegative(),
  tokenHash: NAME,
  finish: NAME.nullable(),
  params: z.record(z.string(), z.number()),
  view: z.enum(BAKE_VIEWS),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpr: z.union([z.literal(2), z.literal(3)]),
  theme: z.enum(BAKE_THEMES),
  target: BAKE_TARGET,
});

export type BakeKey = z.infer<typeof BAKE_KEY>;

export const BAKE_REQUEST = z.strictObject({ id: NAME, key: BAKE_KEY, spec: MODEL_SPEC });

export type BakeRequest = z.infer<typeof BAKE_REQUEST>;

export const BAKE_MESSAGE = z.tuple([z.string()]);

const REQUEST_ID = z.object({ id: NAME });

const RECT = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export type BakeRect = z.infer<typeof RECT>;

const POINT = z.strictObject({ x: z.number(), y: z.number() });

export type BakePoint = z.infer<typeof POINT>;

export const BAKE_LAYER_ROLES = ['body', 'part', 'emissive', 'shadow'] as const;

export type BakeLayerRole = (typeof BAKE_LAYER_ROLES)[number];

const LAYER = z.strictObject({
  id: NAME,
  role: z.enum(BAKE_LAYER_ROLES),
  uri: NAME,
  rect: RECT,
  pivot: POINT.nullable(),
  channels: z.array(NAME),
});

export type BakeLayer = z.infer<typeof LAYER>;

const ANCHOR = z.strictObject({
  id: NAME,
  kind: z.enum(['screen', 'emitter', 'effect', 'mount', 'label', 'hit']),
  rect: RECT,
});

export type BakeAnchor = z.infer<typeof ANCHOR>;

const CANVAS = {
  id: NAME,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpr: z.number().positive(),
  ms: z.number().nonnegative(),
};

export const LAYERS_RESULT = z.strictObject({
  kind: z.literal('layers'),
  ...CANVAS,
  layers: z.array(LAYER),
  anchors: z.array(ANCHOR),
});

export type LayersResult = z.infer<typeof LAYERS_RESULT>;

const COUNT = z.number().int().nonnegative();

export const CLIP_RESULT = z.strictObject({
  kind: z.literal('clip'),
  ...CANVAS,
  shotId: NAME,
  uri: NAME,
  rect: RECT,
  columns: z.number().int().positive(),
  rows: z.number().int().positive(),
  introFrames: COUNT,
  loopFrames: z.number().int().positive(),
  stillFrame: COUNT,
  frameS: z.number().positive(),
  periodS: z.number().positive(),
});

export type ClipResult = z.infer<typeof CLIP_RESULT>;

export const BAKE_FAILURES = ['webgl', 'spec', 'state', 'render', 'lost'] as const;

export type BakeFailure = (typeof BAKE_FAILURES)[number];

export const FAILED_RESULT = z.strictObject({
  kind: z.literal('failed'),
  id: NAME,
  reason: z.enum(BAKE_FAILURES),
  detail: z.string(),
});

export type FailedResult = z.infer<typeof FAILED_RESULT>;

export const BAKE_RESULT = z.discriminatedUnion('kind', [
  LAYERS_RESULT,
  CLIP_RESULT,
  FAILED_RESULT,
]);

export type BakeResult = z.infer<typeof BAKE_RESULT>;

export type BakedImage = LayersResult | ClipResult;

export interface BakerHandle extends DOMImperativeFactory {
  bake: WireMessage;
}

export interface BakerDomProps {
  readonly ref: Ref<BakerHandle>;
  readonly onReady: () => Promise<void>;
  readonly onResult: (text: string) => Promise<void>;
  readonly onLost: (cause: string) => Promise<void>;
  readonly onUnavailable: (detail: string) => Promise<void>;
  readonly dom?: DOMProps;
}

export function failed(id: string, reason: BakeFailure, detail: string): FailedResult {
  return { kind: 'failed', id, reason, detail };
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}

export function requestIdOf(text: string): string | null {
  const parsed = REQUEST_ID.safeParse(parseJson(text));
  return parsed.success ? parsed.data.id : null;
}

function sortedParams(params: Readonly<Record<string, number>>): readonly [string, number][] {
  return Object.entries(params).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function bakeKeyText(key: BakeKey): string {
  const target = key.target.kind === 'keyframe' ? key.target.state : key.target.shotId;
  return JSON.stringify([
    key.specHash,
    key.bakeVersion,
    key.tokenHash,
    key.finish,
    sortedParams(key.params),
    key.view,
    key.width,
    key.height,
    key.dpr,
    key.theme,
    key.target.kind,
    target,
  ]);
}

function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0;
  for (let at = 0; at < text.length; at += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(at), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function bakeKeyHash(key: BakeKey): string {
  const text = bakeKeyText(key);
  return `${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x050c5d1f)}`;
}

export interface BakesInUse {
  readonly specHashes: ReadonlySet<string>;
  readonly tokenHashes: ReadonlySet<string>;
  readonly themes: ReadonlySet<BakeTheme>;
}

export function isSuperseded(key: BakeKey, inUse: BakesInUse): boolean {
  return (
    key.bakeVersion !== BAKE_VERSION ||
    !inUse.specHashes.has(key.specHash) ||
    !inUse.tokenHashes.has(key.tokenHash) ||
    !inUse.themes.has(key.theme)
  );
}

export const BAKED_IMAGE = z.discriminatedUnion('kind', [LAYERS_RESULT, CLIP_RESULT]);

export const STORED_BAKE = z.strictObject({
  keyText: z.string(),
  key: BAKE_KEY,
  image: BAKED_IMAGE,
});

export type StoredBake = z.infer<typeof STORED_BAKE>;

export interface BakeCache {
  readonly read: (key: BakeKey) => Promise<StoredBake | null>;
  readonly write: (key: BakeKey, image: BakedImage) => Promise<StoredBake>;
  readonly prune: (inUse: BakesInUse) => Promise<number>;
}

export function imageUris(image: BakedImage): readonly string[] {
  return image.kind === 'layers' ? image.layers.map((layer) => layer.uri) : [image.uri];
}

export function withUris(image: BakedImage, uris: readonly string[]): BakedImage {
  if (image.kind === 'clip') return { ...image, uri: uris[0] ?? image.uri };
  return {
    ...image,
    layers: image.layers.map((layer, at) => ({ ...layer, uri: uris[at] ?? layer.uri })),
  };
}

interface Pending {
  readonly request: BakeRequest;
  readonly resolve: (result: BakeResult) => void;
}

export interface HandleSource {
  current: BakerHandle | null;
}

export class BakeChannel {
  readonly slot: HandleSource = { current: null };
  private connected = false;
  private unavailable: string | null = null;
  private readonly pending = new Map<string, Pending>();
  private readonly sent = new Set<string>();
  private readonly lostOnce = new Set<string>();

  bake(request: BakeRequest): Promise<BakeResult> {
    if (this.unavailable !== null) {
      return Promise.resolve(failed(request.id, 'webgl', this.unavailable));
    }
    return new Promise((resolve) => {
      const entry: Pending = { request, resolve };
      this.pending.set(request.id, entry);
      this.send(entry);
    });
  }

  ready(): void {
    this.connected = true;
    for (const entry of this.pending.values()) this.send(entry);
  }

  lost(): void {
    this.connected = false;
    for (const id of [...this.sent]) {
      if (this.lostOnce.has(id)) this.settle(failed(id, 'lost', 'baker lost twice'));
      else this.lostOnce.add(id);
    }
    this.sent.clear();
  }

  fail(detail: string): void {
    this.unavailable = detail;
    for (const entry of [...this.pending.values()]) {
      this.settle(failed(entry.request.id, 'webgl', detail));
    }
  }

  receive(text: string): boolean {
    const parsed = BAKE_RESULT.safeParse(parseJson(text));
    if (!parsed.success) return false;
    return this.settle(parsed.data);
  }

  private settle(result: BakeResult): boolean {
    const entry = this.pending.get(result.id);
    if (entry === undefined) return false;
    this.pending.delete(result.id);
    this.sent.delete(result.id);
    this.lostOnce.delete(result.id);
    entry.resolve(result);
    return true;
  }

  private send(entry: Pending): void {
    const handle = this.connected ? this.slot.current : null;
    const { id } = entry.request;
    if (handle === null || this.sent.has(id)) return;
    this.sent.add(id);
    handle.bake(JSON.stringify(entry.request));
  }
}
