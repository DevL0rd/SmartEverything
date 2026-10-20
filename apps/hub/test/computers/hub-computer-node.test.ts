import { readFileSync } from 'node:fs';
import {
  API_ENDPOINTS,
  COMPUTER_RUNTIME_REPLY,
  type ComputerRuntimeReply,
} from '@smarteverything/domain';
import { Logger, type LogRecord } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import type { ComputerRuntimeHost } from '../../src/computers/runtime-host';
import type { MicHandlers } from '../../src/node/controls/linux/mic-capture';
import type { SpeakerStream } from '../../src/node/controls/linux/speaker-playback';
import { ComputerEar, type EarFactory } from '../../src/node/ear/computer-ear';
import { FakeClock } from '../support/fake-clock';
import { captureLogs } from '../support/logs';
import { stubControls, useComputerHub } from '../support/paired-computer';
import { call } from '../support/server';
import { until } from '../support/wait';

const START = '2026-10-18T10:00:00.000Z';
const CHUNK = 1600;
const CHUNK_MS = 100;
const SILENCE_SAMPLES = 16_000;

const hub = useComputerHub();

function wakeAudio(): Int16Array {
  const bytes = readFileSync(new URL('../assistant/fixtures/hw_us1.pcm', import.meta.url));
  const pcm = new Int16Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const padded = new Int16Array(pcm.length + SILENCE_SAMPLES * 3);
  padded.set(pcm, SILENCE_SAMPLES);
  return padded;
}

function fakeHost(runtime: ComputerRuntimeHost['runtime']): ComputerRuntimeHost {
  return {
    runtime,
    read: (): Promise<never> => Promise.reject(new Error('this test never reads a runtime')),
    execute: ({ request }): Promise<ComputerRuntimeReply> =>
      request.operation === 'configure'
        ? Promise.resolve(
            COMPUTER_RUNTIME_REPLY.parse({
              runtime,
              reply: { operation: 'configure', value: request.settings },
            }),
          )
        : Promise.reject(new Error('this test only configures a runtime')),
    onEvent: (): (() => void) => () => undefined,
    stop: (): void => undefined,
  };
}

interface Microphone {
  readonly factory: EarFactory;
  readonly opened: () => number;
  readonly speak: (pcm: Int16Array) => void;
}

function microphone(): Microphone {
  const clock = new FakeClock(START);
  const handlers: MicHandlers[] = [];
  const speaker: SpeakerStream = { write: (): void => undefined, end: (): void => undefined };
  return {
    factory: (send) =>
      new ComputerEar({
        capture: {
          open: (opened): Promise<() => void> => {
            handlers.push(opened);
            return Promise.resolve((): void => undefined);
          },
        },
        speaker: { open: (): Promise<SpeakerStream> => Promise.resolve(speaker) },
        discord: { watch: (): (() => void) => () => undefined },
        send,
        clock,
        log: new Logger('hub.node-ear'),
      }),
    opened: () => handlers.length,
    speak: (pcm): void => {
      for (let offset = 0; offset + CHUNK <= pcm.length; offset += CHUNK) {
        handlers.at(-1)?.pcm(pcm.slice(offset, offset + CHUNK));
        clock.advanceTo(new Date(clock.now().getTime() + CHUNK_MS).toISOString());
      }
    },
  };
}

async function computers(): Promise<readonly { readonly id: string; readonly model: string }[]> {
  const reply = await call(hub.booted().base, hub.booted().owner, {
    method: 'GET',
    path: '/api/devices',
  });
  return API_ENDPOINTS.listDevices.response
    .parse(reply.body)
    .filter((device) => device.kind === 'computer');
}

async function answers(deviceId: string): Promise<boolean> {
  const reply = await call(hub.booted().base, hub.booted().owner, {
    method: 'GET',
    path: `/api/computers/${deviceId}/apps`,
  });
  return reply.status === 200;
}

async function resolved(deviceId: string): Promise<boolean> {
  const reply = await call(hub.booted().base, hub.booted().owner, {
    method: 'GET',
    path: `/api/computers/${deviceId}/apps`,
  });
  return reply.status === 200;
}

describe.skipIf(process.platform !== 'linux')('the hub computer as its own node service', () => {
  it('wakes from the node ear on the hub machine, as the one hub-role computer row', async () => {
    const logs = captureLogs();
    const paired = await hub.pair();
    const mic = microphone();
    hub.run(paired, stubControls(), {
      ear: mic.factory,
      hosts: [fakeHost('claude'), fakeHost('codex')],
    });

    await until(() => answers(paired.deviceId), 'the computer to answer');
    await until(() => resolved(paired.deviceId), 'the computer to answer');
    await until(() => mic.opened() === 1, 'the node ear to open the microphone');
    mic.speak(wakeAudio());
    const hubSpotted = (): LogRecord | undefined =>
      logs.records.find(
        (record) => record.event === 'wake.spotted' && record.payload['computerId'] !== undefined,
      );
    await until(() => hubSpotted() !== undefined, 'the hub to hear the wake claim');

    const spotted = hubSpotted();
    expect(spotted?.payload).toMatchObject({ computerId: paired.deviceId, granted: true });
    const rows = await computers();
    expect(rows.map((row) => row.id)).toEqual([paired.deviceId]);
    expect(rows[0]?.model).toBe('smarteverything.computer.hub');
  }, 30_000);

  it('marks the node on the hub machine as the local computer of the hub', async () => {
    const paired = await hub.pair();
    hub.run(paired, stubControls(), { hosts: [fakeHost('claude'), fakeHost('codex')] });

    await until(() => answers(paired.deviceId), 'the computer to answer');
    const status = await call(hub.booted().base, hub.booted().owner, {
      method: 'GET',
      path: `/api/computers/${paired.deviceId}/claude`,
    });
    expect(API_ENDPOINTS.readComputerAi.response.parse(status.body)).toMatchObject({
      device_id: paired.deviceId,
      local: true,
    });
  }, 30_000);
});
