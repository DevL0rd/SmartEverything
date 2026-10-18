import { readFileSync } from 'node:fs';
import type { WakeSensitivity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Ear } from '../src/wake-name/ear';
import { KeywordSpotter } from '../src/wake-name/keyword-spotter';
import type { WakeGrant } from '../src/wake-name/wake-claims';
import { captureLogs } from './support/logs';

const START = '2026-10-18T10:00:00.000Z';
const FRAME = 320;
const FRAME_MS = 20;

const noModel = (): Promise<never> => Promise.reject(new Error('no speech model in this test'));
const granted = (): WakeGrant => ({ granted: true, onSuperseded: (): void => undefined });

function voice(): Int16Array {
  const bytes = readFileSync(new URL('assistant/fixtures/hw_us1.pcm', import.meta.url));
  const pcm = new Int16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const out = new Int16Array(pcm.length + 16_000 * 3);
  out.set(pcm, 16_000);
  return out;
}

function earOf(woke: string[]): { ear: Ear; feed: (pcm: Int16Array) => void } {
  let now = Date.parse(START);
  const ear = new Ear(
    {
      claims: { request: granted },
      spotter: new KeywordSpotter(),
      model: noModel,
      pauseMs: (): 200 => 200,
      names: (): string[] => ['Coordinator'],
      clock: { now: (): Date => new Date(now), at: (): (() => void) => (): void => undefined },
      log: new Logger('hub.wake-name'),
    },
    {
      claim: { source: 'camera', key: 'living' },
      fields: { cameraId: 'living' },
      sensitivity: (): WakeSensitivity => 'standard',
      resting: (): boolean => false,
      wake: (phrase): void => {
        woke.push(phrase);
      },
      speech: null,
    },
  );
  return {
    ear,
    feed: (pcm): void => {
      for (let offset = 0; offset + FRAME <= pcm.length; offset += FRAME) {
        ear.hear(pcm.slice(offset, offset + FRAME));
        now += FRAME_MS;
      }
    },
  };
}

beforeEach(() => {
  captureLogs();
});

afterEach(() => {
  Logger.reset();
});

describe('an ear that is closing', () => {
  it('wakes while open', async () => {
    const woke: string[] = [];
    const { ear, feed } = earOf(woke);
    feed(voice());
    expect(woke).toEqual(['hey Coordinator']);
    await ear.close();
  }, 60_000);

  it('hears nothing once it has been closed', async () => {
    const woke: string[] = [];
    const { ear, feed } = earOf(woke);
    await ear.close();
    feed(voice());
    expect(woke).toEqual([]);
  }, 60_000);
});
