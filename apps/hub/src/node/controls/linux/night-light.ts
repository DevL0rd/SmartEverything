import type { DisplayChange, NightLight } from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { RunProgram } from '../../run-program';
import { variant, type SessionBus } from './dbus-session';

const log = new Logger('hub.node-displays');

const KWIN = 'org.kde.KWin';
const NIGHT_LIGHT = {
  destination: KWIN,
  path: '/org/kde/KWin/NightLight',
  iface: 'org.kde.KWin.NightLight',
} as const;
const PROPERTIES = 'org.freedesktop.DBus.Properties';
const CONSTANT_MODE = 0;

const READING = z.tuple([
  z.object({
    available: variant(z.boolean()),
    enabled: variant(z.boolean()),
    running: variant(z.boolean()),
    mode: variant(z.number()),
    currentTemperature: variant(z.number()),
  }),
]);

type NightLightChange = Extract<DisplayChange, { action: 'night_light' }>;

function modeOf(enabled: boolean, kwinMode: number): NightLight['mode'] {
  if (!enabled) {
    return 'off';
  }
  return kwinMode === CONSTANT_MODE ? 'on' : 'scheduled';
}

export type NightLightBus = Pick<SessionBus, 'call' | 'watch'>;

const UNSUPPORTED_NIGHT_LIGHT: NightLight = {
  supported: false,
  mode: 'off',
  active: false,
  temperatureKelvin: null,
};

export class KwinNightLight {
  constructor(
    private readonly bus: () => NightLightBus,
    private readonly run: RunProgram,
  ) {}

  async read(): Promise<NightLight> {
    let reply: readonly unknown[];
    try {
      reply = await this.bus().call({
        ...NIGHT_LIGHT,
        iface: PROPERTIES,
        member: 'GetAll',
        signature: 's',
        body: [NIGHT_LIGHT.iface],
      });
    } catch (cause) {
      log.debug('night_light.unavailable', () => ({
        reason: messageOf(cause),
      }));
      return UNSUPPORTED_NIGHT_LIGHT;
    }
    const [properties] = READING.parse(reply);
    if (!properties.available) {
      return UNSUPPORTED_NIGHT_LIGHT;
    }
    return {
      supported: true,
      mode: modeOf(properties.enabled, properties.mode),
      active: properties.running,
      temperatureKelvin: properties.currentTemperature,
    };
  }

  async set(change: NightLightChange): Promise<void> {
    if (!(await this.read()).supported) {
      throw new NodeFailureError('not_supported', 'Night light is not available on this computer.');
    }
    if (change.temperatureKelvin !== undefined) {
      await this.write('NightTemperature', String(change.temperatureKelvin));
    }
    if (change.mode !== 'off') {
      await this.write('Mode', change.mode === 'on' ? 'Constant' : 'DarkLight');
    }
    await this.write('Active', change.mode === 'off' ? 'false' : 'true');
  }

  async watch(onChange: () => void): Promise<() => void> {
    return this.bus().watch(
      { path: NIGHT_LIGHT.path, iface: PROPERTIES, member: 'PropertiesChanged' },
      onChange,
    );
  }

  private async write(key: string, value: string): Promise<void> {
    await this.run('kwriteconfig6', [
      '--notify',
      '--file',
      'kwinrc',
      '--group',
      'NightColor',
      '--key',
      key,
      value,
    ]);
  }
}
