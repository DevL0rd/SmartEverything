import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Cancel } from '../src/clock';
import { OPUS_SILENCE } from '../src/reach/voice-pacing';
import type { MicrophoneHandlers, OpenMicrophone } from '../src/talk/camera-microphone';
import type { RemoteEars } from '../src/listening/remote-ears-port';
import { WakeListeners } from '../src/wake-name/wake-listeners';
import { captureLogs, type CapturedLogs } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { until } from './support/wait';
import { idleWakeTest } from './wake-test-idle';

let opened: TestStore;
let listeners: WakeListeners;
let camera: string;
let logs: CapturedLogs;
let handlers: MicrophoneHandlers | null;
let sensitivities: string[];

const ears: RemoteEars = {
  open: (options) => {
    sensitivities.push(options.sensitivity());
    return Promise.resolve({
      packet: (): void => undefined,
      close: (): Promise<void> => Promise.resolve(),
    });
  },
};

function insertCamera(): string {
  const [row] = opened.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'cam-1',
      parentId: null,
      kind: 'camera',
      name: 'Porch',
      model: 'cam',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

beforeEach(async () => {
  logs = captureLogs();
  handlers = null;
  sensitivities = [];
  opened = await testStore();
  camera = insertCamera();
  listeners = new WakeListeners({
    test: idleWakeTest,
    store: opened.store,
    rules: {
      cameras: (): string[] => [camera],
      wakeOff: (): string[] => [],
      standbyOff: (): string[] => [],
    },
    health: { onChange: (): (() => void) => (): void => undefined },
    microphones: {
      open: (_id: string, given: MicrophoneHandlers): Promise<OpenMicrophone> => {
        handlers = given;
        return Promise.resolve({ stop: () => undefined });
      },
    },
    speakers: { standby: (): (() => void) => (): void => undefined },
    ears,
    wake: (): Promise<void> => Promise.resolve(),
    speech: (): void => undefined,
    clock: { now: (): Date => new Date(), at: (): Cancel => (): void => undefined },
    log: new Logger('hub.test'),
  });
});

afterEach(async () => {
  await listeners.stop();
  await opened.close();
});

async function started(): Promise<void> {
  await listeners.start();
  return until(() => handlers !== null || logs.events().includes('wake.start_failed'), 'the ear');
}

describe('WakeListeners camera row', () => {
  it('fails loudly, naming the camera, when its ear is opened for a camera that has no camera row', async () => {
    await started();
    const failed = logs.records.find((record) => record.event === 'wake.start_failed');
    expect(failed).toBeDefined();
    expect(JSON.stringify(failed)).toContain(camera);
    expect(handlers).toBeNull();
  });

  it('takes the sensitivity from the camera row when it has one', async () => {
    opened.store.cameras.upsert([
      {
        deviceId: camera,
        streamName: 'porch',
        sourceUrlKind: 'rtsp',
        physicalPtz: false,
        twoWayAudio: false,
      },
    ]);
    opened.store.cameras.change(camera, { wake_sensitivity: 'high' });
    await started();
    expect(sensitivities).toEqual(['high']);
    handlers?.packet(OPUS_SILENCE);
  });
});

describe('WakeListeners and the state of other devices', () => {
  it('does not list the cameras again when a device that is not a camera changes state', async () => {
    let listed = 0;
    const [lamp] = opened.store.devices.upsert([
      {
        provider: 'xiaomi',
        externalId: 'lamp-1',
        parentId: null,
        kind: 'light',
        name: 'Desk lamp',
        model: 'lamp',
        manufacturer: 'Xiaomi',
        providerRoom: null,
        roomId: null,
        online: true,
        capabilities: [],
        details: {},
      },
    ]);
    if (lamp === undefined) throw new Error('The lamp was not stored.');
    await listeners.stop();
    listeners = new WakeListeners({
      test: idleWakeTest,
      store: opened.store,
      rules: {
        cameras: (): string[] => {
          listed += 1;
          return [camera];
        },
        wakeOff: (): string[] => [],
        standbyOff: (): string[] => [],
      },
      health: { onChange: (): (() => void) => (): void => undefined },
      microphones: {
        open: (): Promise<OpenMicrophone> => Promise.resolve({ stop: () => undefined }),
      },
      speakers: { standby: (): (() => void) => (): void => undefined },
      ears,
      wake: (): Promise<void> => Promise.resolve(),
      speech: (): void => undefined,
      clock: { now: (): Date => new Date(), at: (): Cancel => (): void => undefined },
      log: new Logger('hub.test'),
    });
    await listeners.start();
    const before = listed;
    for (let step = 0; step < 5; step += 1) {
      opened.store.state.write([
        {
          deviceId: lamp.id,
          capability: 'brightness',
          value: step * 10,
          observedAt: new Date(Date.now() + step).toISOString(),
        },
      ]);
    }
    expect(listed).toBe(before);
    opened.store.state.write([
      { deviceId: camera, capability: 'power', value: true, observedAt: new Date().toISOString() },
    ]);
    await until(() => listed > before, 'the camera state to be considered');
  });
});
