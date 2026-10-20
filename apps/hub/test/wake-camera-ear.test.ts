import { Logger } from '@smarteverything/logging';
import type { WakeSensitivity } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { opusCodec } from '../src/assistant-voice/audio';
import type { RemoteEar, RemoteEars } from '../src/listening/remote-ears-port';
import type { MicrophoneHandlers, OpenMicrophone } from '../src/talk/camera-microphone';
import { CameraOfflineError } from '../src/cameras/camera-service';
import { CameraEar } from '../src/wake-name/camera-ear';
import { FakeClock } from './support/fake-clock';
import { captureLogs, type CapturedLogs } from './support/logs';

const START = '2026-10-17T16:30:00.000Z';

let logs: CapturedLogs;

beforeEach(() => {
  logs = captureLogs();
});

afterEach(() => {
  Logger.reset();
});

function payloads(event: string): Record<string, unknown>[] {
  return logs.records
    .filter((record) => record.event === event)
    .map((record) => ({ ...record.payload }));
}

class Fed {
  readonly packets: Uint8Array[] = [];
  closed = false;

  readonly ears: RemoteEars = {
    open: (): Promise<RemoteEar> =>
      Promise.resolve({
        packet: (packet): void => {
          this.packets.push(packet);
        },
        close: (): Promise<void> => {
          this.closed = true;
          return Promise.resolve();
        },
      }),
  };
}

const inertEars = new Fed().ears;

describe('camera audio stall', () => {
  it('reopens the camera audio when packets stop after it was flowing', async () => {
    const clock = new FakeClock(START);
    const codec = opusCodec();
    const packet = codec.encode(new Int16Array(960));
    codec.free();
    const opened: MicrophoneHandlers[] = [];
    const ear = new CameraEar('living', {
      ears: inertEars,
      microphones: {
        open: (_id, handlers): Promise<OpenMicrophone> => {
          opened.push(handlers);
          return Promise.resolve({ stop: () => undefined });
        },
      },
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

describe('camera ear of a camera that is down', () => {
  it('stops asking while the camera is down and listens again the moment it is told the camera recovered', async () => {
    const clock = new FakeClock(START);
    let down = true;
    let asked = 0;
    const ear = new CameraEar('living', {
      ears: inertEars,
      microphones: {
        open: (id): Promise<OpenMicrophone> => {
          asked += 1;
          return down
            ? Promise.reject(new CameraOfflineError(id))
            : Promise.resolve({ stop: () => undefined });
        },
      },
      sensitivity: (): WakeSensitivity => 'standard',
      busy: (): boolean => false,
      clock,
      log: new Logger('hub.wake-name'),
    });
    await ear.open();
    clock.advanceTo('2026-10-17T17:30:00.000Z');
    expect(asked).toBe(1);
    expect(payloads('wake.listen_failed')).toEqual([]);
    expect(payloads('wake.waiting_for_camera')).toHaveLength(1);
    down = false;
    ear.resume();
    await Promise.resolve();
    expect(asked).toBe(2);
    expect(payloads('wake.resumed')).toHaveLength(1);
    ear.resume();
    expect(asked).toBe(2);
    await ear.close();
  });
});

describe('camera ear feeding a remote ear', () => {
  it('hands every camera packet to the remote ear as it came and closes it with the camera ear', async () => {
    const clock = new FakeClock(START);
    const fed = new Fed();
    const opened: MicrophoneHandlers[] = [];
    const ear = new CameraEar('living', {
      ears: fed.ears,
      microphones: {
        open: (_id, handlers): Promise<OpenMicrophone> => {
          opened.push(handlers);
          return Promise.resolve({ stop: () => undefined });
        },
      },
      sensitivity: (): WakeSensitivity => 'standard',
      busy: (): boolean => false,
      clock,
      log: new Logger('hub.wake-name'),
    });
    await ear.open();
    const first = Uint8Array.of(1, 2, 3);
    const second = Uint8Array.of(4, 5);
    opened[0]?.packet(first);
    opened[0]?.packet(second);
    expect(fed.packets).toEqual([first, second]);
    await ear.close();
    expect(fed.closed).toBe(true);
  });

  it('keeps the same remote ear when the camera audio is reopened', async () => {
    const clock = new FakeClock(START);
    const fed = new Fed();
    let opens = 0;
    const opened: MicrophoneHandlers[] = [];
    const ear = new CameraEar('living', {
      ears: {
        open: (options): Promise<RemoteEar> => {
          opens += 1;
          return fed.ears.open(options);
        },
      },
      microphones: {
        open: (_id, handlers): Promise<OpenMicrophone> => {
          opened.push(handlers);
          return Promise.resolve({ stop: () => undefined });
        },
      },
      sensitivity: (): WakeSensitivity => 'standard',
      busy: (): boolean => false,
      clock,
      log: new Logger('hub.wake-name'),
    });
    await ear.open();
    opened[0]?.ended('the camera dropped');
    clock.advanceTo('2026-10-17T16:30:06.000Z');
    await Promise.resolve();
    expect(opened).toHaveLength(2);
    expect(opens).toBe(1);
    await ear.close();
  });
});
