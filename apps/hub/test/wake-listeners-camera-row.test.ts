import { Logger } from '@smarteverything/logging';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Cancel } from '../src/clock';
import { OPUS_SILENCE } from '../src/reach/voice-pacing';
import type { MicrophoneHandlers, OpenMicrophone } from '../src/talk/camera-microphone';
import { KeywordSpotter } from '../src/wake-name/keyword-spotter';
import type { WakeGrant } from '../src/wake-name/wake-claims';
import { WakeListeners } from '../src/wake-name/wake-listeners';
import { captureLogs } from './support/logs';
import { testStore, type TestStore } from './support/store';
import { until } from './support/wait';
import { idleWakeTest } from './wake-test-idle';

let opened: TestStore;
let listeners: WakeListeners;
let camera: string;
let handlers: MicrophoneHandlers | null;

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
  captureLogs();
  handlers = null;
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
    microphones: {
      open: (_id: string, given: MicrophoneHandlers): Promise<OpenMicrophone> => {
        handlers = given;
        return Promise.resolve({ stop: () => undefined });
      },
    },
    speakers: { standby: (): (() => void) => (): void => undefined },
    ears: {
      spotter: (): KeywordSpotter => new KeywordSpotter(),
      diagnostics: null,
      pause: { ms: (): 200 => 200 },
    },
    claims: { request: (): WakeGrant => ({ granted: true, onSuperseded: (): void => undefined }) },
    names: (): string[] => ['Aibi'],
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

async function hear(): Promise<void> {
  listeners.start();
  await until(() => handlers !== null, 'the microphone');
  handlers?.packet(OPUS_SILENCE);
}

describe('WakeListeners camera row', () => {
  it('throws when audio arrives for a camera that has no camera row', async () => {
    await expect(hear()).rejects.toThrow(camera);
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
    await expect(hear()).resolves.toBeUndefined();
  });
});
