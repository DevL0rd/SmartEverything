import { readFileSync } from 'node:fs';
import type { RemoteEarNodeMessage } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { wakeEarEngine } from '../../../src/node/ear/ear-engine';
import { EarHost } from '../../../src/node/ear/ear-host';
import { KeywordSpotter } from '../../../src/wake-name/keyword-spotter';
import { FakeClock } from '../../support/fake-clock';
import { captureLogs, type CapturedLogs } from '../../support/logs';
import { until } from '../../support/wait';
import { configOf, packetsOf } from './ear-fakes';

const START = '2026-10-18T10:00:00.000Z';
const PACKET_MS = 20;
const UPSAMPLE = 3;

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(() => {
  Logger.reset();
});

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`../../assistant/fixtures/${name}.pcm`, import.meta.url));
  const speech = new Int16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const padded = new Int16Array(speech.length + 16_000 * 3);
  padded.set(speech, 16_000);
  return padded;
}

function atCameraRate(pcm16k: Int16Array, channels: number): Int16Array {
  const out = new Int16Array(pcm16k.length * UPSAMPLE * channels);
  pcm16k.forEach((sample, index) => {
    for (let step = 0; step < UPSAMPLE * channels; step++) {
      out[index * UPSAMPLE * channels + step] = sample;
    }
  });
  return out;
}

function keywordConfig(name: string): ReturnType<typeof configOf> {
  const spotter = new KeywordSpotter();
  const { keywords, threshold, nearMissThreshold } = spotter.earConfig([name], 'standard');
  spotter.free();
  return configOf({ keywords: [...keywords], threshold, nearMissThreshold });
}

interface Run {
  readonly sent: RemoteEarNodeMessage[];
  readonly stop: () => Promise<void>;
}

async function hear(fixtureName: string, channels: 1 | 2, name: string): Promise<Run> {
  const clock = new FakeClock(START);
  const sent: RemoteEarNodeMessage[] = [];
  const host = new EarHost(
    { engine: wakeEarEngine(), clock, log: new Logger('hub.node-ear') },
    (_key, message) => {
      sent.push(message);
    },
  );
  host.receive({
    type: 'ears_open',
    source: { kind: 'camera', key: 'living' },
    codec: channels === 1 ? 'opus_48k_mono' : 'opus_48k_stereo',
    config: keywordConfig(name),
  });
  await until(() => logs.events().includes('ear_host.listening'), 'the ear', 20_000);
  for (const packet of packetsOf(atCameraRate(fixture(fixtureName), channels), channels)) {
    host.receive({ type: 'ears_audio', key: 'living', packets: [packet] });
    clock.advanceTo(new Date(clock.now().getTime() + PACKET_MS).toISOString());
  }
  return { sent, stop: () => host.stop() };
}

describe('ear host with the real spotter and Opus', () => {
  it('claims the wake word heard through mono Opus', async () => {
    const run = await hear('hw_us1', 1, 'Coordinator');
    const claim = run.sent.find((one) => one.kind === 'claim');
    expect(claim?.kind === 'claim' && claim.claim.phrase.toLowerCase()).toBe('hey coordinator');
    expect(claim?.kind === 'claim' && claim.claim.snippetDbfs).toBeLessThan(-6);
    expect(claim?.kind === 'claim' && claim.claim.snippetDbfs).toBeGreaterThan(-60);
    await run.stop();
  }, 60_000);

  it('claims the wake word heard through stereo Opus', async () => {
    const run = await hear('hw_us1', 2, 'Coordinator');
    const claim = run.sent.find((one) => one.kind === 'claim');
    expect(claim?.kind === 'claim' && claim.claim.phrase.toLowerCase()).toBe('hey coordinator');
    await run.stop();
  }, 60_000);

  it('claims nothing in ordinary speech', async () => {
    const run = await hear('person', 1, 'Coordinator');
    expect(run.sent.filter((one) => one.kind === 'claim')).toEqual([]);
    await run.stop();
  }, 60_000);
});
