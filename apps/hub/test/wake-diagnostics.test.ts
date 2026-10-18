import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { WakeSensitivity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { opusCodec } from '../src/assistant-voice/audio';
import type { MicrophoneHandlers, OpenMicrophone } from '../src/talk/camera-microphone';
import { CameraEar } from '../src/wake-name/camera-ear';
import { Ear } from '../src/wake-name/ear';
import { EarWatch, NEAR_SETTLE_MS, SILENT_MS, SUMMARY_MS } from '../src/wake-name/ear-watch';
import { KeywordSpotter } from '../src/wake-name/keyword-spotter';
import type { WakeGrant } from '../src/wake-name/wake-claims';
import {
  WAKE_CLIP_REQUEST_FILE,
  WAKE_DIAGNOSTICS_DIRECTORY,
  WakeDiagnostics,
} from '../src/wake-name/wake-diagnostics';
import { FakeClock } from './support/fake-clock';
import { captureLogs, type CapturedLogs } from './support/logs';
import { until } from './support/wait';

const START = '2026-10-17T16:30:00.000Z';
const FRAME = 320;
const FRAME_MS = 20;

let logs: CapturedLogs;
let directory: string;

beforeEach(async () => {
  logs = captureLogs();
  directory = await mkdtemp(join(tmpdir(), 'wake-diagnostics-'));
});

afterEach(async () => {
  Logger.reset();
  await rm(directory, { recursive: true, force: true });
});

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`assistant/fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function padded(pcm: Int16Array): Int16Array {
  const out = new Int16Array(pcm.length + 16_000 * 3);
  out.set(pcm, 16_000);
  return out;
}

function fainter(pcm: Int16Array): Int16Array {
  return Int16Array.from(pcm, (sample) => Math.round(sample * 0.7));
}

function payloads(event: string): Record<string, unknown>[] {
  return logs.records
    .filter((record) => record.event === event)
    .map((record) => ({ ...record.payload }));
}

const noModel = (): Promise<never> => Promise.reject(new Error('no speech model in this test'));

const granted = (): WakeGrant => ({ granted: true, onSuperseded: (): void => undefined });

interface Bench {
  readonly ear: Ear;
  readonly diagnostics: WakeDiagnostics | null;
  readonly feed: (pcm: Int16Array) => void;
  readonly woke: string[];
  readonly transcribed: number[];
}

function bench(sensitivity: WakeSensitivity, diagnose: boolean): Bench {
  let now = Date.parse(START);
  const clock = {
    now: (): Date => new Date(now),
    at: (): (() => void) => (): void => undefined,
  };
  const spotter = new KeywordSpotter();
  const transcribed: number[] = [];
  const diagnostics = diagnose
    ? new WakeDiagnostics({
        dataDirectory: directory,
        spotter: (): KeywordSpotter => spotter,
        names: (): string[] => ['Coordinator'],
        transcribe: (pcm): Promise<string | null> => {
          transcribed.push(pcm.length);
          return Promise.resolve('hey coordinator turn on the lights');
        },
        clock,
        log: new Logger('hub.wake-name'),
      })
    : null;
  const woke: string[] = [];
  const ear = new Ear(
    {
      claims: { request: granted },
      spotter,
      model: noModel,
      pauseMs: (): 200 => 200,
      names: (): string[] => ['Coordinator'],
      diagnostics,
      clock,
      log: new Logger('hub.wake-name'),
    },
    {
      claim: { source: 'camera', key: 'living' },
      fields: { cameraId: 'living' },
      sensitivity: (): WakeSensitivity => sensitivity,
      resting: (): boolean => false,
      wake: (phrase): void => {
        woke.push(phrase);
      },
      speech: null,
    },
  );
  const feed = (pcm: Int16Array): void => {
    for (let offset = 0; offset + FRAME <= pcm.length; offset += FRAME) {
      ear.hear(pcm.slice(offset, offset + FRAME));
      now += FRAME_MS;
    }
  };
  return { ear, diagnostics, feed, woke, transcribed };
}

describe('ear watch', () => {
  const watch = (): { watch: EarWatch; missed: number[] } => {
    const missed: number[] = [];
    return {
      watch: new EarWatch({
        fields: { cameraId: 'living' },
        log: new Logger('hub.wake-name'),
        missed: (miss): void => {
          missed.push(miss.heardAt);
        },
      }),
      missed,
    };
  };
  const frame = new Int16Array(FRAME).fill(3277);

  it('reports a near miss once it settles without a wake', () => {
    const { watch: one, missed } = watch();
    expect(
      one.near({
        phrase: 'hey Coordinator',
        heardAt: 0,
        snippetDbfs: -30,
        sensitivity: 'standard',
      }),
    ).toBe(true);
    one.heard(frame, NEAR_SETTLE_MS - 1, 'listening', 'standard');
    expect(missed).toEqual([]);
    one.heard(frame, NEAR_SETTLE_MS, 'listening', 'standard');
    expect(missed).toEqual([0]);
    expect(payloads('wake.near_miss')).toEqual([
      expect.objectContaining({
        cameraId: 'living',
        sensitivity: 'standard',
        threshold: 0.15,
        scoreAtLeast: 0.06,
        snippetDbfs: -30,
      }),
    ]);
  });

  it('drops a near hit that belongs to a real wake', () => {
    const { watch: one, missed } = watch();
    one.near({ phrase: 'hey Coordinator', heardAt: 0, snippetDbfs: -30, sensitivity: 'high' });
    one.woke(40);
    expect(
      one.near({ phrase: 'hey Coordinator', heardAt: 80, snippetDbfs: -30, sensitivity: 'high' }),
    ).toBe(false);
    one.heard(frame, 5000, 'listening', 'high');
    expect(missed).toEqual([]);
    expect(payloads('wake.near_miss')).toEqual([]);
  });

  it('summarises frames, level and state every 30 s', () => {
    const { watch: one } = watch();
    for (let at = 0; at <= SUMMARY_MS; at += FRAME_MS) {
      one.heard(frame, at, 'resting', 'standard');
    }
    expect(payloads('wake.ear_summary')).toEqual([
      expect.objectContaining({
        cameraId: 'living',
        state: 'resting',
        frames: SUMMARY_MS / FRAME_MS + 1,
        levelDbfs: -20,
        peakDbfs: -20,
        nearMisses: 0,
        wakes: 0,
        silentMs: 0,
      }),
    ]);
  });

  it('warns once when the camera sends digital silence for 10 s and notes when sound returns', () => {
    const { watch: one } = watch();
    const silence = new Int16Array(FRAME).fill(1);
    for (let at = 0; at < SILENT_MS + 2_000; at += FRAME_MS) {
      one.heard(silence, at, 'listening', 'standard');
    }
    expect(payloads('wake.ear_silent')).toEqual([
      expect.objectContaining({ cameraId: 'living', silentMs: SILENT_MS }),
    ]);
    one.heard(frame, SILENT_MS + 2_000, 'listening', 'standard');
    expect(payloads('wake.ear_sound_returned')).toEqual([
      expect.objectContaining({ cameraId: 'living', silentMs: SILENT_MS + 2_000 }),
    ]);
  });

  it('stays quiet for a quiet room that is not digital silence', () => {
    const { watch: one } = watch();
    const room = Int16Array.from({ length: FRAME }, (_, index) => (index % 2 === 0 ? 12 : -12));
    for (let at = 0; at < SILENT_MS * 2; at += FRAME_MS) {
      one.heard(room, at, 'listening', 'standard');
    }
    expect(payloads('wake.ear_silent')).toEqual([]);
  });

  it('reports the silent stretch in the summary', () => {
    const { watch: one } = watch();
    const silence = new Int16Array(FRAME);
    for (let at = 0; at <= SUMMARY_MS; at += FRAME_MS) {
      one.heard(silence, at, 'listening', 'standard');
    }
    expect(payloads('wake.ear_summary')).toEqual([
      expect.objectContaining({ silentMs: SUMMARY_MS }),
    ]);
  });
});

describe('near misses on recorded audio', () => {
  it('logs a faint far call standard misses, and saves, scores and transcribes it when diagnostics are on', async () => {
    const { feed, woke, transcribed, ear } = bench('standard', true);
    feed(padded(fainter(fixture('far_quiet_hw_us'))));
    expect(woke).toEqual([]);
    expect(payloads('wake.near_miss')).toHaveLength(1);
    await until(() => payloads('wake.diagnostic_heard').length === 1, 'the diagnostic', 45_000);
    const [heard] = payloads('wake.diagnostic_heard');
    expect(heard).toMatchObject({
      cameraId: 'living',
      reason: 'near_miss',
      text: 'hey coordinator turn on the lights',
    });
    expect(heard?.['clipMs']).toBeGreaterThan(4000);
    expect(heard?.['score']).toBeGreaterThanOrEqual(0.06);
    expect(heard?.['score']).toBeLessThan(0.15);
    expect(transcribed).toHaveLength(1);
    const saved = await readdir(join(directory, WAKE_DIAGNOSTICS_DIRECTORY));
    expect(saved).toEqual([heard?.['clip']]);
    await ear.close();
  }, 60_000);

  it('still logs the near miss but keeps, scores and transcribes nothing when diagnostics are off', async () => {
    const { feed, transcribed, ear } = bench('standard', false);
    feed(padded(fainter(fixture('far_quiet_hw_us'))));
    expect(payloads('wake.near_miss')).toHaveLength(1);
    expect(payloads('wake.diagnostic_heard')).toEqual([]);
    expect(transcribed).toEqual([]);
    await ear.close();
  }, 60_000);

  it('wakes without a near miss when the call passes the threshold', async () => {
    const { feed, woke, ear } = bench('standard', true);
    feed(padded(fixture('hw_us1')));
    expect(woke).toEqual(['hey Coordinator']);
    expect(payloads('wake.near_miss')).toEqual([]);
    await ear.close();
  }, 60_000);

  it('saves the last 10 s of every ear when the clip request file appears', async () => {
    const { feed, ear, diagnostics } = bench('standard', true);
    feed(padded(fixture('person')));
    await diagnostics?.start();
    await writeFile(join(directory, WAKE_CLIP_REQUEST_FILE), '');
    await until(() => payloads('wake.diagnostic_heard').length === 1, 'the asked clip', 45_000);
    expect(payloads('wake.diagnostic_heard')[0]).toMatchObject({ reason: 'asked', score: null });
    diagnostics?.stop();
    await ear.close();
  }, 60_000);
});

describe('scores', () => {
  it('scores a clear call above the standard threshold and other speech at nothing', async () => {
    const spotter = new KeywordSpotter();
    expect(
      await spotter.scoreOf(['Coordinator'], padded(fixture('hw_us1'))),
    ).toBeGreaterThanOrEqual(0.15);
    expect(await spotter.scoreOf(['Coordinator'], padded(fixture('person')))).toBeNull();
  }, 60_000);
});

describe('camera audio stall', () => {
  it('reopens the camera audio when packets stop after it was flowing', async () => {
    const clock = new FakeClock(START);
    const codec = opusCodec();
    const packet = codec.encode(new Int16Array(960));
    codec.free();
    const opened: MicrophoneHandlers[] = [];
    const ear = new CameraEar('living', {
      pauseMs: (): 200 => 200,
      claims: { request: granted },
      microphones: {
        open: (_id, handlers): Promise<OpenMicrophone> => {
          opened.push(handlers);
          return Promise.resolve({ stop: () => undefined });
        },
      },
      spotter: new KeywordSpotter(),
      model: noModel,
      names: (): string[] => ['Coordinator'],
      sensitivity: (): WakeSensitivity => 'standard',
      busy: (): boolean => false,
      clock,
      log: new Logger('hub.wake-name'),
    });
    await ear.open();
    opened[0]?.packet(packet);
    clock.advanceTo('2026-10-17T16:30:10.000Z');
    opened[0]?.packet(packet);
    clock.advanceTo('2026-10-17T16:30:20.000Z');
    expect(payloads('wake.listen_failed')).toEqual([]);
    clock.advanceTo('2026-10-17T16:30:40.000Z');
    expect(payloads('wake.listen_failed')).toEqual([
      expect.objectContaining({ reason: 'the camera audio stalled', retryInMs: 5000 }),
    ]);
    await ear.close();
  }, 30_000);
});
