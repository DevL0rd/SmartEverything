import { readFileSync } from 'node:fs';
import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EarChild } from '../../../src/node/ear/process/ear-child';
import { WakeKeywords } from '../../../src/wake-name/keyword-lines';
import { until } from '../../support/wait';
import { configOf, packetsOf } from './ear-fakes';

const UPSAMPLE = 3;
const CHUNK = 1600;
const INIT = {
  dataDirectory: null,
  logPath: '/nonexistent/service.log',
  level: 'info',
  release: '1',
};

interface Emitted {
  readonly name: string;
  readonly payload: unknown;
}

let emitted: Emitted[];
let child: EarChild;

beforeEach(() => {
  emitted = [];
  child = new EarChild((name, payload) => {
    emitted.push({ name, payload });
  });
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

function atCameraRate(pcm16k: Int16Array): Int16Array {
  const out = new Int16Array(pcm16k.length * UPSAMPLE);
  pcm16k.forEach((sample, index) => {
    for (let step = 0; step < UPSAMPLE; step++) {
      out[index * UPSAMPLE + step] = sample;
    }
  });
  return out;
}

function coordinator(): ReturnType<typeof configOf> {
  const { keywords, threshold, nearMissThreshold } = new WakeKeywords().earConfig(
    ['Coordinator'],
    'standard',
  );
  return configOf({ keywords: [...keywords], threshold, nearMissThreshold });
}

const named = (name: string): Emitted[] => emitted.filter((one) => one.name === name);

describe('ear child requests', () => {
  it('refuses to host ears before it was initialised', () => {
    expect(() => {
      child.event('frame', {
        port: 1,
        frame: { type: 'ears_close', key: 'cam' },
      });
    }).toThrow('before it was initialised');
  });

  it('refuses a call and an event it does not know', async () => {
    await expect(child.call('mystery', null)).rejects.toThrow('does not know the call mystery');
    expect(() => {
      child.event('mystery', null);
    }).toThrow('does not know the event mystery');
  });

  it('answers a ping at once', async () => {
    await expect(child.call('ping', null)).resolves.toBeNull();
  });

  it('refuses a frame that is not about ears', async () => {
    await child.call('init', INIT);
    expect(() => {
      child.event('frame', { port: 1, frame: { type: 'scopes', scopes: {} } });
    }).toThrow();
  });
});

describe('ear child with the real models', () => {
  it('relays the log lines of the child to its parent', async () => {
    await child.call('init', INIT);
    new Logger('hub.node-ear').warn('ear_process.checked', { fine: true });
    const lines = named('log').map((one) => one.payload);
    expect(lines).toContainEqual({
      level: 'warn',
      scope: 'hub.node-ear',
      event: 'ear_process.checked',
      payload: { fine: true },
    });
  }, 60_000);

  it('claims the wake word of a relayed ear for the port that opened it', async () => {
    await child.call('init', INIT);
    child.event('frame', {
      port: 7,
      frame: {
        type: 'ears_open',
        source: { kind: 'camera', key: 'living' },
        codec: 'opus_48k_mono',
        config: coordinator(),
      },
    });
    await until(
      () => named('log').some((one) => JSON.stringify(one.payload).includes('ear_host.listening')),
      'the ear to listen',
      20_000,
    );
    for (const packet of packetsOf(atCameraRate(fixture('hw_us1')), 1)) {
      child.event('frame', {
        port: 7,
        frame: { type: 'ears_audio', key: 'living', packets: [packet] },
      });
    }
    await until(
      () => named('send').some((one) => JSON.stringify(one.payload).includes('"claim"')),
      'the wake claim',
      20_000,
    );
    const claim = named('send')
      .map((one) => one.payload)
      .find((payload) => JSON.stringify(payload).includes('"claim"'));
    expect(claim).toMatchObject({ port: 7, key: 'living', message: { kind: 'claim' } });
    await child.call('port_stop', { port: 7 });
  }, 90_000);

  it('claims the wake word of a local pipeline fed with microphone audio', async () => {
    await child.call('init', INIT);
    await child.call('local_open', { id: 3, config: coordinator() });
    const pcm = fixture('hw_us1');
    for (let offset = 0; offset + CHUNK <= pcm.length; offset += CHUNK) {
      child.event('local_audio', { id: 3, pcm: pcm.slice(offset, offset + CHUNK) });
    }
    await until(() => named('local_claim').length > 0, 'the wake claim', 20_000);
    expect(named('local_claim')[0]?.payload).toMatchObject({ id: 3 });
    await child.call('local_close', { id: 3 });
  }, 90_000);
});
