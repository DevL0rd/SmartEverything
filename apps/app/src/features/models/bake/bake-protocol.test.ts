import { describe, expect, it } from 'vitest';
import { BAKE_VERSION } from '../../../components/models/three/bake-version';
import {
  BakeChannel,
  bakeKeyHash,
  bakeKeyText,
  dprBucket,
  isSuperseded,
  requestIdOf,
  type BakeKey,
  type BakeRequest,
  type BakeResult,
} from './bake-protocol';

const KEY: BakeKey = {
  specHash: 'spec-a',
  bakeVersion: BAKE_VERSION,
  tokenHash: 'tokens-a',
  finish: null,
  params: { width: 2, seats: 3 },
  view: 'tile',
  width: 96,
  height: 96,
  dpr: 2,
  theme: 'light',
  target: { kind: 'keyframe', state: 'off' },
};

function request(id: string): BakeRequest {
  return {
    id,
    key: KEY,
    spec: {
      schema: 1,
      id: 'dev.test.box',
      version: '1.0.0',
      title: 'Box',
      category: 'other',
      footprint: { width: 1, depth: 1, height: 1 },
      framing: {
        tile: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
        card: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
        hero: { yaw: 0, pitch: 0, fov: 30, padding: 0.1 },
      },
      materials: { body: { finish: 'matte-white' } },
      parts: [],
    },
  };
}

function layers(id: string): BakeResult {
  return { kind: 'layers', id, width: 96, height: 96, dpr: 2, ms: 3, layers: [], anchors: [] };
}

function harness(): { readonly channel: BakeChannel; readonly sent: string[] } {
  const channel = new BakeChannel();
  const sent: string[] = [];
  channel.slot.current = {
    bake: (...args: unknown[]): void => {
      sent.push(String(args[0]));
    },
  };
  return { channel, sent };
}

describe('bake protocol', () => {
  it('buckets the device pixel ratio to 2 or 3', () => {
    expect(dprBucket(1)).toBe(2);
    expect(dprBucket(2)).toBe(2);
    expect(dprBucket(2.625)).toBe(3);
  });

  it('keys every part of 2.6 and ignores the order of params', () => {
    const swapped = { ...KEY, params: { seats: 3, width: 2 } };
    expect(bakeKeyText(swapped)).toBe(bakeKeyText(KEY));
    expect(bakeKeyHash(swapped)).toBe(bakeKeyHash(KEY));
    const changes: Partial<BakeKey>[] = [
      { specHash: 'spec-b' },
      { bakeVersion: BAKE_VERSION + 1 },
      { tokenHash: 'tokens-b' },
      { finish: 'oak' },
      { params: { width: 3, seats: 3 } },
      { view: 'card' },
      { width: 97 },
      { dpr: 3 },
      { theme: 'dark' },
      { target: { kind: 'keyframe', state: 'on' } },
      { target: { kind: 'shot', shotId: 'off' } },
    ];
    const hashes = new Set(changes.map((change) => bakeKeyHash({ ...KEY, ...change })));
    expect(hashes.size).toBe(changes.length);
    expect(hashes.has(bakeKeyHash(KEY))).toBe(false);
    expect(bakeKeyHash(KEY)).toMatch(/^[0-9a-f]{16}$/u);
  });

  it('marks entries of an older bake version, spec, token set or theme as superseded', () => {
    const inUse = {
      specHashes: new Set(['spec-a']),
      tokenHashes: new Set(['tokens-a']),
      themes: new Set(['light', 'dark'] as const),
    };
    expect(isSuperseded(KEY, inUse)).toBe(false);
    expect(isSuperseded({ ...KEY, bakeVersion: BAKE_VERSION - 1 }, inUse)).toBe(true);
    expect(isSuperseded({ ...KEY, specHash: 'old' }, inUse)).toBe(true);
    expect(isSuperseded({ ...KEY, tokenHash: 'old' }, inUse)).toBe(true);
    expect(isSuperseded(KEY, { ...inUse, themes: new Set(['dark'] as const) })).toBe(true);
  });

  it('reads the request id from a message, even a broken one', () => {
    expect(requestIdOf(JSON.stringify({ id: 'r1', key: 1 }))).toBe('r1');
    expect(requestIdOf('{not json')).toBeNull();
  });

  it('holds requests until the baker is ready and resolves them by id', async () => {
    const { channel, sent } = harness();
    const first = channel.bake(request('r1'));
    expect(sent).toHaveLength(0);
    channel.ready();
    expect(sent).toHaveLength(1);
    expect(channel.receive(JSON.stringify(layers('other')))).toBe(false);
    expect(channel.receive('{broken')).toBe(false);
    expect(channel.receive(JSON.stringify(layers('r1')))).toBe(true);
    await expect(first).resolves.toMatchObject({ kind: 'layers', id: 'r1' });
  });

  it('resends a request after the baker is remounted and fails it when it is lost twice', async () => {
    const { channel, sent } = harness();
    channel.ready();
    const bake = channel.bake(request('r1'));
    channel.lost();
    channel.ready();
    expect(sent).toHaveLength(2);
    channel.lost();
    await expect(bake).resolves.toMatchObject({ kind: 'failed', reason: 'lost' });
  });

  it('fails every waiting and later request when WebGL is missing', async () => {
    const { channel } = harness();
    const waiting = channel.bake(request('r1'));
    channel.fail('no context');
    await expect(waiting).resolves.toMatchObject({ kind: 'failed', reason: 'webgl' });
    await expect(channel.bake(request('r2'))).resolves.toMatchObject({ reason: 'webgl' });
  });
});
