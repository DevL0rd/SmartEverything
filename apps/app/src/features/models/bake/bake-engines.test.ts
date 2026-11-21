import { afterEach, describe, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => ({ live: false, dispose: vi.fn() }));

vi.mock('./bake-run', () => ({
  createBakeContext: (): object | string => (run.live ? { dispose: run.dispose } : 'no webgl'),
  detailOf: (error: unknown): string => String(error),
  settleBake: (): never => {
    throw new Error('unused');
  },
}));

vi.mock('./bake-staging', () => ({ documentStaging: (): object => ({}) }));

const { bakeDriver } = await import('./bake-engines');
const { BakeChannel } = await import('./bake-protocol');

type Listener = (event: { readonly data?: unknown; readonly message?: string }) => void;

const workers: FakeWorker[] = [];

class FakeWorker {
  readonly listeners = new Map<string, Listener>();
  readonly posted: unknown[] = [];
  constructor() {
    workers.push(this);
  }
  addEventListener(kind: string, listener: Listener): void {
    this.listeners.set(kind, listener);
  }
  postMessage(message: unknown): void {
    this.posted.push(message);
  }
  terminate(): void {
    this.listeners.clear();
  }
  emit(data: unknown): void {
    this.listeners.get('message')?.({ data });
  }
}

function canvas(): HTMLCanvasElement {
  vi.stubGlobal('document', {
    createElement: () => ({ addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  return document.createElement('canvas');
}

function request(id: string): Parameters<InstanceType<typeof BakeChannel>['bake']>[0] {
  return {
    id,
    key: {
      specHash: 's',
      bakeVersion: 1,
      tokenHash: 't',
      finish: null,
      params: {},
      view: 'tile',
      width: 96,
      height: 96,
      dpr: 2,
      theme: 'light',
      target: { kind: 'keyframe', state: 'off' },
    },
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

function wire(): {
  readonly channel: InstanceType<typeof BakeChannel>;
  readonly driver: ReturnType<typeof bakeDriver>;
} {
  const channel = new BakeChannel();
  const driver = bakeDriver(canvas(), {
    ready: () => {
      channel.ready();
    },
    result: (text) => {
      channel.receive(text);
    },
    lost: () => {
      channel.lost();
    },
    unavailable: (detail) => {
      channel.fail(detail);
    },
  });
  channel.slot.current = {
    bake: (...args: unknown[]): void => {
      driver.send(String(args[0]));
    },
  };
  return { channel, driver };
}

afterEach(() => {
  vi.unstubAllGlobals();
  workers.length = 0;
  run.live = false;
  run.dispose.mockClear();
});

describe('the bake driver', () => {
  it('fails waiting and later bakes when neither the worker nor the inline engine has WebGL', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', Date);
    const { channel, driver } = wire();
    driver.start();
    const waiting = channel.bake(request('r1'));
    expect(() => {
      workers[0]?.emit({ kind: 'unavailable', detail: 'worker has no webgl' });
    }).not.toThrow();
    await expect(waiting).resolves.toMatchObject({ kind: 'failed', reason: 'webgl' });
    await expect(channel.bake(request('r2'))).resolves.toMatchObject({
      kind: 'failed',
      reason: 'webgl',
      detail: 'no webgl',
    });
    driver.dispose();
  });

  it('has its inline engine in place before it reports ready, so a waiting bake reaches it', () => {
    vi.stubGlobal('requestIdleCallback', vi.fn());
    run.live = true;
    const { channel, driver } = wire();
    const waiting = channel.bake(request('r1'));
    expect(() => {
      driver.start();
    }).not.toThrow();
    driver.dispose();
    expect(run.dispose).toHaveBeenCalledTimes(1);
    void waiting;
  });

  it('settles a bake sent after the engine is gone as failed instead of throwing', async () => {
    const { channel, driver } = wire();
    channel.ready();
    driver.dispose();
    await expect(channel.bake(request('r1'))).resolves.toMatchObject({
      kind: 'failed',
      reason: 'webgl',
      detail: 'the baker has no engine',
    });
  });
});
