import { describe, expect, it } from 'vitest';
import {
  DdcBrightness,
  parseBrief,
  parseDetect,
} from '../../../src/node/controls/linux/screen-brightness';
import { KwinNightLight, type NightLightBus } from '../../../src/node/controls/linux/night-light';
import {
  DesktopRevertNotice,
  type NoticeAnswer,
  type NoticeBus,
} from '../../../src/node/controls/linux/revert-notice';
import { watchDrm } from '../../../src/node/controls/linux/udev-monitor';
import { fakeLines, installed, recorder } from './support';

const DETECT = `Invalid display
   I2C bus:          /dev/i2c-3
   DRM connector:    card1-HDMI-A-1
   Monitor:          SAM:Odyssey G95SC:H1AK500000

Display 1
   I2C bus:          /dev/i2c-5
   DRM connector:    card1-DP-3
   Monitor:          DEL:DELL U2723QE:ABC

Display 2
   I2C bus:          /dev/i2c-6
   DRM connector:    card1-DP-4
`;

describe('ddcutil brightness', () => {
  it('maps connectors to display numbers and skips invalid displays', () => {
    expect([...parseDetect(DETECT)]).toEqual([
      ['DP-3', 1],
      ['DP-4', 2],
    ]);
    expect(parseBrief('VCP 10 C 50 100')).toEqual({ current: 50, max: 100 });
    expect(() => parseBrief('Display not found')).toThrow(/ddcutil reported no brightness/);
  });

  it('reads a percentage once and writes the raw value scaled to the monitor maximum', async () => {
    const system = recorder({
      'ddcutil detect': DETECT,
      'ddcutil --display 1 getvcp': 'VCP 10 C 30 60',
      'ddcutil --display 1 setvcp': '',
    });
    const ddc = new DdcBrightness(system.run, installed('ddcutil'));
    await expect(ddc.covers('DP-3')).resolves.toBe(true);
    await expect(ddc.covers('HDMI-A-1')).resolves.toBe(false);
    await expect(ddc.read('DP-3')).resolves.toBe(50);
    await ddc.read('DP-3');
    expect(system.calls.filter((call) => call.includes('getvcp'))).toHaveLength(1);
    await ddc.set('DP-3', 100);
    expect(system.calls).toContain('ddcutil --display 1 setvcp 10 60');
    await expect(ddc.read('DP-3')).resolves.toBe(100);
    await expect(ddc.set('HDMI-A-1', 10)).rejects.toMatchObject({ code: 'not_supported' });
    ddc.invalidate();
    await ddc.read('DP-3');
    expect(system.calls.filter((call) => call.includes('detect'))).toHaveLength(2);
  });

  it('covers nothing without ddcutil and never runs it', async () => {
    const system = recorder({});
    const ddc = new DdcBrightness(system.run, installed());
    await expect(ddc.covers('DP-3')).resolves.toBe(false);
    await expect(ddc.read('DP-3')).resolves.toBeNull();
    expect(system.calls).toEqual([]);
  });
});

function nightBus(reply: unknown): NightLightBus {
  return {
    call: () => (reply instanceof Error ? Promise.reject(reply) : Promise.resolve([reply])),
    watch: () => Promise.resolve(() => undefined),
  };
}

const NIGHT = (enabled: boolean, mode: number, available = true): unknown => ({
  available: { value: available },
  enabled: { value: enabled },
  running: { value: true },
  mode: { value: mode },
  currentTemperature: { value: 4500 },
});

describe('KWin night light', () => {
  it('maps KWin modes to off, on and scheduled', async () => {
    const read = (reply: unknown): ReturnType<KwinNightLight['read']> =>
      new KwinNightLight(() => nightBus(reply), recorder({}).run).read();
    await expect(read(NIGHT(false, 0))).resolves.toEqual({
      supported: true,
      mode: 'off',
      active: true,
      temperatureKelvin: 4500,
    });
    await expect(read(NIGHT(true, 0))).resolves.toMatchObject({ mode: 'on' });
    await expect(read(NIGHT(true, 1))).resolves.toMatchObject({ mode: 'scheduled' });
  });

  it('is unsupported when KWin has none or is not on the bus', async () => {
    const unsupported = { supported: false, mode: 'off', active: false, temperatureKelvin: null };
    await expect(
      new KwinNightLight(() => nightBus(NIGHT(true, 0, false)), recorder({}).run).read(),
    ).resolves.toEqual(unsupported);
    await expect(
      new KwinNightLight(() => nightBus(new Error('ServiceUnknown')), recorder({}).run).read(),
    ).resolves.toEqual(unsupported);
  });

  it('writes the KWin config with change notification, switching it on last', async () => {
    const system = recorder({ kwriteconfig6: '' });
    const light = new KwinNightLight(() => nightBus(NIGHT(false, 0)), system.run);
    await light.set({ action: 'night_light', mode: 'on', temperatureKelvin: 3500 });
    expect(system.calls).toEqual([
      'kwriteconfig6 --notify --file kwinrc --group NightColor --key NightTemperature 3500',
      'kwriteconfig6 --notify --file kwinrc --group NightColor --key Mode Constant',
      'kwriteconfig6 --notify --file kwinrc --group NightColor --key Active true',
    ]);
    const scheduled = recorder({ kwriteconfig6: '' });
    await new KwinNightLight(() => nightBus(NIGHT(false, 0)), scheduled.run).set({
      action: 'night_light',
      mode: 'scheduled',
    });
    expect(scheduled.calls[0]).toContain('--key Mode DarkLight');
    const off = recorder({ kwriteconfig6: '' });
    await new KwinNightLight(() => nightBus(NIGHT(true, 0)), off.run).set({
      action: 'night_light',
      mode: 'off',
    });
    expect(off.calls).toEqual([
      'kwriteconfig6 --notify --file kwinrc --group NightColor --key Active false',
    ]);
  });

  it('refuses to change what is not there', async () => {
    const light = new KwinNightLight(() => nightBus(NIGHT(true, 0, false)), recorder({}).run);
    await expect(light.set({ action: 'night_light', mode: 'on' })).rejects.toMatchObject({
      code: 'not_supported',
    });
  });
});

describe('the keep-or-revert desktop notice', () => {
  function bus(): {
    bus: NoticeBus;
    calls: { member: string; body: readonly unknown[] | undefined }[];
    invoke: (body: readonly unknown[]) => void;
  } {
    const calls: { member: string; body: readonly unknown[] | undefined }[] = [];
    let listener: (body: readonly unknown[], sender: string) => void = () => undefined;
    return {
      calls,
      invoke: (body): void => {
        listener(body, ':1.1');
      },
      bus: {
        call: (request): Promise<readonly unknown[]> => {
          calls.push({ member: request.member, body: request.body });
          return Promise.resolve(request.member === 'Notify' ? [7] : []);
        },
        watch: (_rule, onSignal): Promise<() => void> => {
          listener = onSignal;
          return Promise.resolve(() => undefined);
        },
      },
    };
  }

  it('shows Keep and Revert actions and reports only the answer to its own notification', async () => {
    const test = bus();
    const answers: NoticeAnswer[] = [];
    const close = await new DesktopRevertNotice(() => test.bus).show(
      'Turned off eDP-2',
      15,
      (answer) => answers.push(answer),
    );
    const notify = test.calls[0]?.body;
    expect(notify?.[3]).toBe('Keep these display settings?');
    expect(notify?.[4]).toBe('Turned off eDP-2. Reverting in 15 s.');
    expect(notify?.[5]).toEqual(['keep', 'Keep', 'revert', 'Revert']);
    expect(notify?.[7]).toBe(15000);
    test.invoke([8, 'keep']);
    test.invoke([7, 'default']);
    test.invoke([7, 'revert']);
    expect(answers).toEqual(['revert']);
    await close();
    expect(test.calls.at(-1)).toEqual({ member: 'CloseNotification', body: [7] });
  });
});

describe('the drm monitor', () => {
  it('reports only drm add, change and remove events', () => {
    const lines = fakeLines();
    let count = 0;
    watchDrm(
      lines.subscriber,
      () => (count += 1),
      () => undefined,
    );
    expect(lines.started[0]).toMatchObject({
      program: 'udevadm',
      args: ['monitor', '--udev', '--subsystem-match=drm'],
    });
    lines.emit('monitor will print the received events for:');
    lines.emit('UDEV  [1.1] change   /devices/x/drm/card1 (drm)');
    lines.emit('UDEV  [1.2] remove   /devices/x/drm/card1/card1-DP-3 (drm)');
    lines.emit('UDEV  [1.3] change   /devices/x/input/event3 (input)');
    expect(count).toBe(2);
  });
});
