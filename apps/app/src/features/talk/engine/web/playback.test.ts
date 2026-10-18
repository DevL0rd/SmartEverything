import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Playback } from './playback';

interface World {
  decoderOutput: ((data: unknown) => void) | null;
  readonly sources: unknown[];
}

const world = vi.hoisted((): World => ({ decoderOutput: null, sources: [] }));

class FakeSourceNode {
  buffer: { duration: number } | null = null;
  readonly listeners = new Map<string, () => void>();
  connect(): void {
    world.sources.push(this);
  }
  addEventListener(name: string, listener: () => void): void {
    this.listeners.set(name, listener);
  }
  start(): void {
    return undefined;
  }
  stop(): void {
    return undefined;
  }
}

class FakeContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  createGain(): unknown {
    return { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn() };
  }
  createBuffer(_channels: number, length: number, rate: number): unknown {
    return { duration: length / rate, copyToChannel: vi.fn() };
  }
  createBufferSource(): FakeSourceNode {
    return new FakeSourceNode();
  }
  resume(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeDecoder {
  state = 'configured';
  constructor(init: { output: (data: unknown) => void }) {
    world.decoderOutput = init.output;
  }
  configure(): void {
    return undefined;
  }
  decode(): void {
    return undefined;
  }
  flush(): Promise<void> {
    return Promise.resolve();
  }
  close(): void {
    return undefined;
  }
}

function frame(amplitude: number): unknown {
  return {
    numberOfFrames: 4,
    sampleRate: 48_000,
    copyTo: (target: Float32Array): void => {
      target.fill(amplitude);
    },
    close: vi.fn(),
  };
}

function ended(index: number): void {
  const source = world.sources[index];
  if (source instanceof FakeSourceNode) {
    source.listeners.get('ended')?.();
  }
}

describe('the playback level', () => {
  beforeEach(() => {
    world.sources.length = 0;
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('AudioDecoder', FakeDecoder);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the first buffer when playback starts, then each next one as the last ends', () => {
    const playback = new Playback(vi.fn());
    const levels: number[] = [];
    playback.onLevel((level) => levels.push(level));
    playback.begin();
    world.decoderOutput?.(frame(0.1));
    world.decoderOutput?.(frame(0.2));
    expect(levels).toHaveLength(1);
    expect(levels[0]).toBeCloseTo(0.4);
    ended(0);
    expect(levels).toHaveLength(2);
    expect(levels[1]).toBeCloseTo(0.8);
    ended(1);
    expect(levels.at(-1)).toBe(0);
  });

  it('scales with the volume and never goes above one', () => {
    const playback = new Playback(vi.fn());
    const levels: number[] = [];
    playback.onLevel((level) => levels.push(level));
    playback.setVolume(0.5);
    playback.begin();
    world.decoderOutput?.(frame(0.2));
    expect(levels[0]).toBeCloseTo(0.4);
    ended(0);
    playback.setVolume(1);
    world.decoderOutput?.(frame(0.9));
    expect(levels.at(-1)).toBe(1);
  });

  it('reports silence after a cut', () => {
    const playback = new Playback(vi.fn());
    const levels: number[] = [];
    playback.onLevel((level) => levels.push(level));
    playback.begin();
    world.decoderOutput?.(frame(0.2));
    playback.cut();
    ended(0);
    expect(levels.at(-1)).toBe(0);
    expect(playback.playing()).toBe(false);
  });

  it('stops reporting when the listener is removed', () => {
    const playback = new Playback(vi.fn());
    const levels: number[] = [];
    playback.onLevel((level) => levels.push(level));
    playback.onLevel(null);
    playback.begin();
    world.decoderOutput?.(frame(0.2));
    expect(levels).toEqual([]);
  });
});
