import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Cancel } from '../src/clock';
import type { RemoteEars } from '../src/listening/remote-ears-port';
import type { OpenMicrophone } from '../src/talk/camera-microphone';
import { WakeListeners } from '../src/wake-name/wake-listeners';
import { testStore, type TestStore } from './support/store';
import { captureLogs, type CapturedLogs } from './support/logs';
import { Logger } from '@smarteverything/logging';
import { idleWakeTest } from './wake-test-idle';

const inertEars: RemoteEars = {
  open: () =>
    Promise.resolve({
      packet: (): void => undefined,
      close: (): Promise<void> => Promise.resolve(),
    }),
};

let opened: TestStore;
let listeners: WakeListeners;
let camera: string;
let logs: CapturedLogs;
let standbyOff: string[];
let standbys: string[];

function insert(): string {
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
      capabilities: [
        { key: 'privacy_mode', label: 'Privacy', access: 'read_write', value: { kind: 'boolean' } },
      ],
      details: {},
    },
  ]);
  return row?.id ?? '';
}

function privacy(on: boolean): void {
  opened.store.state.write([
    {
      deviceId: camera,
      capability: 'privacy_mode',
      value: on,
      observedAt: new Date().toISOString(),
    },
  ]);
}

beforeEach(async () => {
  logs = captureLogs();
  opened = await testStore();
  camera = insert();
  standbyOff = [];
  standbys = [];
  listeners = new WakeListeners({
    test: idleWakeTest,
    store: opened.store,
    rules: {
      cameras: (): string[] => [camera],
      wakeOff: (): string[] => [],
      standbyOff: (): string[] => standbyOff,
    },
    health: { onChange: (): (() => void) => (): void => undefined },
    microphones: {
      open: (): Promise<OpenMicrophone> => Promise.resolve({ stop: () => undefined }),
    },
    speakers: {
      standby: (id: string): (() => void) => {
        standbys.push(`on ${id}`);
        return (): void => {
          standbys.push(`off ${id}`);
        };
      },
    },
    ears: inertEars,
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

function listening(): boolean {
  const events = logs
    .events()
    .filter((event) => event === 'wake.listening' || event === 'wake.stopped');
  return events.at(-1) === 'wake.listening';
}

describe('WakeListeners', () => {
  it('does not listen to a camera whose privacy switch is on', () => {
    privacy(true);
    listeners.start();
    expect(listening()).toBe(false);
  });

  it('starts listening when the privacy switch goes off and stops when it comes on', () => {
    privacy(true);
    listeners.start();
    privacy(false);
    expect(listening()).toBe(true);
    privacy(true);
    expect(listening()).toBe(false);
  });

  it('stops while the camera is offline and resumes when it is back', () => {
    privacy(false);
    listeners.start();
    expect(listening()).toBe(true);
    opened.store.devices.setOnline([camera], false);
    expect(listening()).toBe(false);
    opened.store.devices.setOnline([camera], true);
    expect(listening()).toBe(true);
  });

  it('keeps the camera speaker standing by while it listens for the wake word', () => {
    privacy(false);
    listeners.start();
    expect(standbys).toEqual([`on ${camera}`]);
    privacy(true);
    expect(standbys).toEqual([`on ${camera}`, `off ${camera}`]);
  });

  it('leaves the speaker closed for a camera that opted out of the standby', () => {
    standbyOff = [camera];
    privacy(false);
    listeners.start();
    expect(listening()).toBe(true);
    expect(standbys).toEqual([]);
  });
});
