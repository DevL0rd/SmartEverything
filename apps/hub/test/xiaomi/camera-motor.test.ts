import { CommandRefusedError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { ptzPlan, type MiotSpec } from '@smarteverything/xiaomi';
import { describe, expect, it } from 'vitest';
import { go2rtcCameraMotor } from '../../src/adapters/xiaomi/camera-motor';
import { CameraPtz, NO_MOTOR_ENDPOINT } from '../../src/adapters/xiaomi/camera-ptz';
import type { DeviceIo } from '../../src/adapters/xiaomi/device-io';
import { go2rtcClient } from '../../src/cameras/go2rtc-client';
import { fakeGo2rtc, fakeMotor } from './fake-go2rtc';

const CALIBRATE_ONLY: MiotSpec = {
  type: 'urn:miot-spec-v2:device:camera:0000A01C:xiaomi-x:1',
  description: '',
  services: [
    {
      iid: 2,
      type: 'urn:miot-spec-v2:service:camera-control:0000782F:xiaomi-x:1',
      description: '',
      properties: [],
      actions: [
        {
          iid: 1,
          type: 'urn:miot-spec-v2:action:ptz-calibrate:0000280D:xiaomi-x:1',
          description: '',
          in: [],
          out: [],
        },
      ],
      events: [],
    },
  ],
};

function unusedIo(): DeviceIo {
  const refuse = (): Promise<never> => Promise.reject(new Error('the device was not expected'));
  return {
    transport: 'cloud',
    read: refuse,
    write: refuse,
    action: refuse,
    miio: refuse,
    close: () => Promise.resolve(),
  };
}

describe('go2rtc camera motor', () => {
  it('posts the operation for the stream of the camera with the hub credentials', async () => {
    const go2rtc = fakeGo2rtc();
    go2rtc.playing.add('stream-100003');
    const seen: Headers[] = [];
    const client = go2rtcClient({
      baseUrl: 'http://127.0.0.1:1984',
      username: 'hub',
      password: 'secret',
      fetch: (input, init) => {
        seen.push(new Headers(init?.headers));
        return go2rtc.fetch(input, init);
      },
    });
    await client.motor('stream-100003', 4);
    expect(go2rtc.requests).toStrictEqual(['POST /api/xiaomi/motor?src=stream-100003&operation=4']);
    expect(seen[0]?.get('authorization')).toBe(
      `Basic ${Buffer.from('hub:secret').toString('base64')}`,
    );
  });

  it('refuses a camera the hub streams under no go2rtc name', async () => {
    const go2rtc = fakeGo2rtc();
    await expect(fakeMotor(go2rtc).move('lumi.9', 1)).rejects.toThrow(
      new CommandRefusedError('ptz', 'camera lumi.9 has no go2rtc stream on this hub'),
    );
    expect(go2rtc.requests).toStrictEqual([]);
  });

  it('passes on failures that are not go2rtc answers', async () => {
    const motor = go2rtcCameraMotor(
      { motor: () => Promise.reject(new TypeError('fetch failed')) },
      () => 'stream',
    );
    await expect(motor.move('100003', 2)).rejects.toThrow(new TypeError('fetch failed'));
  });

  it('names the missing endpoint when a MISS plan reaches a camera without a motor', async () => {
    const ptz = new CameraPtz(
      { did: '100003', model: 'xiaomi.camera.x', plan: ptzPlan(CALIBRATE_ONLY, 'xiaomi.camera.x') },
      null,
      new Logger('tool.xiaomi-test'),
    );
    await expect(ptz.execute('ptz', { direction: 'home' }, unusedIo())).rejects.toThrow(
      new CommandRefusedError('ptz', NO_MOTOR_ENDPOINT),
    );
  });
});
