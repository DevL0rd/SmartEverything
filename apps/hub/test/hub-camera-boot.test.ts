import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CAMERA, GATEWAY } from './support/fake-provider';
import { captureLogs } from './support/logs';
import { NO_GO2RTC, deviceIdOf, startedHub } from './support/started-hub';
import { testStore, type TestStore } from './support/store';
import { until } from './support/wait';

let opened: TestStore;

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('starting the hub with a stored camera', () => {
  it('finishes starting while the camera is still connecting and serves the stream once it is', async () => {
    const first = await startedHub(opened, { devices: [GATEWAY, CAMERA] });
    await first.hub.stop();
    const connections: (() => void)[] = [];
    const hub = (
      await startedHub(opened, {
        devices: [GATEWAY, CAMERA],
        go2rtc: {
          ...NO_GO2RTC,
          preload: (): Promise<void> =>
            new Promise((resolve) => {
              connections.push(resolve);
            }),
        },
      })
    ).hub;
    const cameraId = deviceIdOf(opened.store, 'camera-1');
    let ready = false;
    const streamReady = hub.streamReady(cameraId).then(() => {
      ready = true;
    });
    await until(() => connections.length === 1, 'the camera connection');
    expect(ready).toBe(false);
    connections[0]?.();
    await streamReady;
    expect(ready).toBe(true);
    await hub.stop();
  });
});
