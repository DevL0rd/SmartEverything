import { DEVICE_FAMILIES, MODEL_SIGNAL_SET, type DeviceFamily } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { VisualState } from '../types';
import { FAMILY_SIGNALS, hexOf, signalsOf, type ModelSignals } from './signals-of';

type Laundry = NonNullable<VisualState['laundry']>;
type Microwave = NonNullable<VisualState['microwave']>;

const BASE: VisualState = {
  power: 'on',
  online: true,
  level: 0.6,
  band: null,
  target: null,
  targetShare: null,
  current: null,
  oscillating: false,
  angle: null,
  colour: null,
  ambientLight: null,
  waterLow: false,
  waterLevel: null,
  thermal: 'idle',
  locked: null,
  position: null,
  progress: null,
  battery: null,
  pulse: null,
  syncing: false,
  load: null,
  reading: null,
  source: null,
  presence: null,
  open: null,
};

const WASHER: Laundry = {
  stage: 'rest',
  phase: 'idle',
  motion: 'none',
  glow: 'rest',
  display: 'program',
  running: false,
  paused: false,
  frozen: false,
  remaining: null,
  progress: null,
  water: 0,
  suds: false,
  drops: false,
  rinse: false,
  blur: false,
  drain: false,
  heat: false,
  puffs: false,
  tint: null,
  door: 'closed',
  drumLight: false,
  childLock: false,
  lowSupply: false,
  remoteOff: false,
  faultCode: null,
  finished: false,
  cleaned: false,
  spin: null,
  dial: null,
};

const OVEN: Microwave = {
  phase: 'idle',
  finished: false,
  remaining: null,
  progress: null,
  mode: null,
  open: false,
  lamp: false,
  locked: false,
  power: null,
  finishedAt: null,
};

function sample(changes: Partial<VisualState>): VisualState {
  return { ...BASE, ...changes };
}

function washer(power: VisualState['power'], changes: Partial<Laundry>): VisualState {
  return sample({ power, laundry: { ...WASHER, ...changes } });
}

function oven(power: VisualState['power'], changes: Partial<Microwave>): VisualState {
  return sample({ power, microwave: { ...OVEN, ...changes } });
}

function expectSignals(family: DeviceFamily, state: VisualState, expected: ModelSignals): void {
  const actual = signalsOf(family, state);
  expect(actual).toEqual(expected);
  expect(MODEL_SIGNAL_SET.safeParse(actual).success).toBe(true);
}

const ON = { power: true, online: true } as const;

describe('signals of the shared state', () => {
  it('reports power and online for a family without its own facts', () => {
    expectSignals('plug', sample({}), ON);
    expectSignals('plug', sample({ power: 'off' }), { power: false, online: true });
  });

  it('leaves power out while it is unknown', () => {
    expectSignals('plug', sample({ power: 'unknown' }), { online: true });
  });

  const shaped = DEVICE_FAMILIES.filter((family) => FAMILY_SIGNALS[family] !== undefined);

  it.each(shaped)('treats offline %s as off', (family) => {
    for (const power of ['on', 'off', 'unknown'] as const) {
      const actual = signalsOf(family, sample({ power, online: false, level: 1 }));
      expect(actual).toMatchObject({ power: false, online: false });
    }
  });

  it('registers the air, kitchen, laundry, climate and light families', () => {
    expect(Object.keys(FAMILY_SIGNALS)).toEqual(
      expect.arrayContaining([
        'air_purifier',
        'humidifier',
        'diffuser',
        'microwave',
        'laundry',
        'dehumidifier',
        'tower_fan',
        'fan',
        'heater',
        'air_conditioner',
        'thermostat',
        'light',
      ]),
    );
  });
});

describe('air_purifier', () => {
  it('runs at its fan level with the ambient lamp', () => {
    expectSignals('air_purifier', sample({ level: 0.8, band: 'good', ambientLight: true }), {
      ...ON,
      speed: 0.8,
      lamp: true,
      airQuality: 'good',
    });
  });

  it('leaves air quality out without a band', () => {
    expectSignals('air_purifier', sample({ level: 0.8, band: null }), {
      ...ON,
      speed: 0.8,
    });
  });

  it('is off', () => {
    expectSignals('air_purifier', sample({ power: 'off', ambientLight: false }), {
      power: false,
      online: true,
      speed: 0.6,
      lamp: false,
    });
  });

  it('is offline with unknown power', () => {
    expectSignals('air_purifier', sample({ power: 'unknown', online: false, level: 0.2 }), {
      power: false,
      online: false,
      speed: 0.2,
    });
  });
});

describe('humidifier', () => {
  it('mists with water in the tank', () => {
    expectSignals('humidifier', sample({ level: 0.4, waterLevel: 0.7 }), {
      ...ON,
      speed: 0.4,
      waterLevel: 0.7,
      waterLow: false,
    });
  });

  it('flags an empty tank', () => {
    expectSignals('humidifier', sample({ waterLow: true, waterLevel: 0 }), {
      ...ON,
      speed: 0.6,
      waterLevel: 0,
      waterLow: true,
    });
  });

  it('is off', () => {
    expectSignals('humidifier', sample({ power: 'off' }), {
      power: false,
      online: true,
      speed: 0.6,
      waterLow: false,
    });
  });
});

describe('diffuser', () => {
  it('sprays with its colour and lamp', () => {
    expectSignals(
      'diffuser',
      sample({
        level: 0.5,
        colour: '#336699',
        ambientLight: true,
        diffuser: { spray: '2026-10-25T10:00:00Z', charging: false, fault: false },
      }),
      {
        ...ON,
        speed: 0.5,
        lamp: true,
        colour: '#336699',
        waterLow: false,
        charging: false,
        fault: false,
      },
    );
  });

  it('charges', () => {
    expectSignals(
      'diffuser',
      sample({ power: 'off', diffuser: { spray: null, charging: true, fault: false } }),
      { power: false, online: true, speed: 0.6, waterLow: false, charging: true, fault: false },
    );
  });

  it('faults on an empty tank', () => {
    expectSignals(
      'diffuser',
      sample({ waterLow: true, diffuser: { spray: null, charging: false, fault: true } }),
      { ...ON, speed: 0.6, waterLow: true, charging: false, fault: true },
    );
  });

  it('works before its facts arrive', () => {
    expectSignals('diffuser', sample({ online: false }), {
      power: false,
      online: false,
      speed: 0.6,
      waterLow: false,
    });
  });
});

describe('microwave', () => {
  it('rests with a closed door while idle', () => {
    expectSignals('microwave', oven('off', {}), {
      power: false,
      online: true,
      phase: 'idle',
      door: 'closed',
      lamp: false,
      locked: false,
    });
  });

  it('cooks with progress, power level, mode and lamp', () => {
    expectSignals(
      'microwave',
      oven('on', { phase: 'running', progress: 0.4, mode: 'Defrost', lamp: true, power: 0.5 }),
      {
        ...ON,
        phase: 'running',
        progress: 0.4,
        door: 'closed',
        lamp: true,
        locked: false,
        level: 0.5,
        mode: 'Defrost',
      },
    );
  });

  it('holds while paused', () => {
    expectSignals('microwave', oven('on', { phase: 'paused', progress: 0.4, lamp: true }), {
      ...ON,
      phase: 'paused',
      progress: 0.4,
      door: 'closed',
      lamp: true,
      locked: false,
    });
  });

  it('shows finished once the job is done and the oven is idle', () => {
    expectSignals('microwave', oven('off', { finished: true }), {
      power: false,
      online: true,
      phase: 'finished',
      door: 'closed',
      lamp: false,
      locked: false,
    });
  });

  it('opens the door with the lamp on and the child lock set', () => {
    expectSignals('microwave', oven('off', { open: true, lamp: true, locked: true, mode: '' }), {
      power: false,
      online: true,
      phase: 'idle',
      door: 'open',
      lamp: true,
      locked: true,
    });
  });

  it('works before its facts arrive', () => {
    expectSignals('microwave', sample({ power: 'unknown' }), { online: true });
  });
});

describe('laundry', () => {
  it('rests off', () => {
    expectSignals('laundry', washer('off', { phase: 'off' }), {
      power: false,
      online: true,
      phase: 'off',
      door: 'closed',
      lamp: false,
      locked: false,
      waterLevel: 0,
      fault: false,
      drumSpeed: null,
    });
  });

  it('waits ready with the door closed', () => {
    expectSignals('laundry', washer('on', {}), {
      ...ON,
      phase: 'idle',
      door: 'closed',
      lamp: false,
      locked: false,
      waterLevel: 0,
      fault: false,
      drumSpeed: null,
    });
  });

  it('tumbles in water with the door locked and no drum speed', () => {
    expectSignals(
      'laundry',
      washer('on', {
        stage: 'water',
        phase: 'wash',
        motion: 'tumble',
        running: true,
        water: 0.35,
        door: 'locked',
        spin: 1400,
        remaining: 72,
      }),
      {
        ...ON,
        phase: 'wash',
        door: 'locked',
        lamp: false,
        locked: false,
        waterLevel: 0.35,
        fault: false,
        drumSpeed: null,
      },
    );
  });

  it('spins at the drum speed and the phase covers spin', () => {
    expectSignals(
      'laundry',
      washer('on', {
        stage: 'spin',
        phase: 'spin',
        motion: 'spin',
        running: true,
        door: 'locked',
        spin: 800,
      }),
      {
        ...ON,
        phase: 'spin',
        door: 'locked',
        lamp: false,
        locked: false,
        waterLevel: 0,
        fault: false,
        drumSpeed: 800,
      },
    );
  });

  it('has no drum speed when the spin speed is unknown', () => {
    expect(
      signalsOf('laundry', washer('on', { phase: 'spin', motion: 'spin', running: true })),
    ).toMatchObject({ phase: 'spin', drumSpeed: null });
  });

  it('stands still with the door open mid cycle and the drum light on', () => {
    expectSignals(
      'laundry',
      washer('on', { phase: 'wash', running: false, door: 'open', drumLight: true }),
      {
        ...ON,
        phase: 'idle',
        door: 'open',
        lamp: true,
        locked: false,
        waterLevel: 0,
        fault: false,
        drumSpeed: null,
      },
    );
  });

  it('holds while paused', () => {
    expectSignals(
      'laundry',
      washer('on', { phase: 'paused', paused: true, frozen: true, door: 'locked', water: 0.35 }),
      {
        ...ON,
        phase: 'paused',
        door: 'locked',
        lamp: false,
        locked: false,
        waterLevel: 0.35,
        fault: false,
        drumSpeed: null,
      },
    );
  });

  it('reports a fault as the phase and stops the drum', () => {
    expectSignals(
      'laundry',
      washer('on', {
        stage: 'alert',
        phase: 'spin',
        motion: 'none',
        frozen: true,
        faultCode: 1,
        door: 'hot',
        spin: 1000,
      }),
      {
        ...ON,
        phase: 'fault',
        door: 'locked',
        lamp: false,
        locked: false,
        waterLevel: 0,
        fault: true,
        drumSpeed: null,
      },
    );
  });

  it('shows the finished cycle with the child lock', () => {
    expectSignals('laundry', washer('on', { phase: 'finished', finished: true, childLock: true }), {
      ...ON,
      phase: 'finished',
      door: 'closed',
      lamp: false,
      locked: true,
      waterLevel: 0,
      fault: false,
      drumSpeed: null,
    });
  });

  it('reports the progress when it is known', () => {
    expect(
      signalsOf(
        'laundry',
        washer('on', { phase: 'dry', running: true, motion: 'slow', progress: 0.5 }),
      ),
    ).toMatchObject({ phase: 'dry', progress: 0.5 });
  });

  it('works before its facts arrive', () => {
    expectSignals('laundry', sample({ power: 'off', online: false }), {
      power: false,
      online: false,
    });
  });
});

describe('dehumidifier', () => {
  it('dries with a tank that has room', () => {
    expectSignals('dehumidifier', sample({ level: 0.75, waterLevel: 0.3 }), {
      ...ON,
      speed: 0.75,
      waterLevel: 0.3,
      waterLow: false,
    });
  });

  it('flags the tank state', () => {
    expectSignals('dehumidifier', sample({ waterLow: true }), {
      ...ON,
      speed: 0.6,
      waterLow: true,
    });
  });

  it('is off', () => {
    expectSignals('dehumidifier', sample({ power: 'off', ambientLight: false }), {
      power: false,
      online: true,
      speed: 0.6,
      lamp: false,
      waterLow: false,
    });
  });
});

describe('tower_fan', () => {
  it('swings at an angle', () => {
    expectSignals('tower_fan', sample({ level: 0.8, oscillating: true, angle: 60 }), {
      ...ON,
      speed: 0.8,
      oscillating: true,
      swingAngle: 60,
    });
  });

  it('blows steadily without a swing angle', () => {
    expectSignals('tower_fan', sample({ level: 0.3 }), {
      ...ON,
      speed: 0.3,
      oscillating: false,
    });
  });

  it('is off', () => {
    expectSignals('tower_fan', sample({ power: 'off' }), {
      power: false,
      online: true,
      speed: 0.6,
      oscillating: false,
    });
  });
});

describe('fan', () => {
  it('oscillates at full speed', () => {
    expectSignals('fan', sample({ level: 1, oscillating: true, angle: 90 }), {
      ...ON,
      speed: 1,
      oscillating: true,
      swingAngle: 90,
    });
  });

  it('holds still facing forward', () => {
    expectSignals('fan', sample({ level: 0.4 }), { ...ON, speed: 0.4, oscillating: false });
  });

  it('is offline', () => {
    expectSignals('fan', sample({ power: 'unknown', online: false }), {
      power: false,
      online: false,
      speed: 0.6,
      oscillating: false,
    });
  });
});

describe('heater', () => {
  it('heats towards its target', () => {
    expectSignals('heater', sample({ thermal: 'heat', target: 22, current: 18.5, level: 0.5 }), {
      ...ON,
      speed: 0.5,
      thermal: 'heating',
      target: 22,
      current: 18.5,
    });
  });

  it('idles once warm', () => {
    expectSignals('heater', sample({ target: 22, current: 22 }), {
      ...ON,
      speed: 0.6,
      thermal: 'idle',
      target: 22,
      current: 22,
    });
  });

  it('is off', () => {
    expectSignals('heater', sample({ power: 'off' }), {
      power: false,
      online: true,
      speed: 0.6,
      thermal: 'idle',
    });
  });
});

describe('air_conditioner', () => {
  it('cools with the vanes swinging', () => {
    expectSignals(
      'air_conditioner',
      sample({
        thermal: 'cool',
        target: 24,
        current: 27,
        level: 0.7,
        oscillating: true,
        angle: 30,
      }),
      {
        ...ON,
        speed: 0.7,
        oscillating: true,
        swingAngle: 30,
        thermal: 'cooling',
        target: 24,
        current: 27,
      },
    );
  });

  it('heats with fixed vanes', () => {
    expectSignals('air_conditioner', sample({ thermal: 'heat', target: 21, current: 17 }), {
      ...ON,
      speed: 0.6,
      oscillating: false,
      thermal: 'heating',
      target: 21,
      current: 17,
    });
  });

  it('is off', () => {
    expectSignals('air_conditioner', sample({ power: 'off', current: 26 }), {
      power: false,
      online: true,
      speed: 0.6,
      oscillating: false,
      thermal: 'idle',
      current: 26,
    });
  });
});

describe('thermostat', () => {
  it('heats', () => {
    expectSignals('thermostat', sample({ thermal: 'heat', target: 21, current: 19 }), {
      ...ON,
      thermal: 'heating',
      target: 21,
      current: 19,
    });
  });

  it('cools', () => {
    expectSignals('thermostat', sample({ thermal: 'cool', target: 23, current: 25 }), {
      ...ON,
      thermal: 'cooling',
      target: 23,
      current: 25,
    });
  });

  it('idles with only the room reading', () => {
    expectSignals('thermostat', sample({ current: 21.5 }), {
      ...ON,
      thermal: 'idle',
      current: 21.5,
    });
  });
});

describe('light', () => {
  it('glows with its brightness and colour', () => {
    expectSignals('light', sample({ level: 0.8, colour: '#ffb46b' }), {
      ...ON,
      brightness: 0.8,
      colour: '#ffb46b',
    });
  });

  it('turns an hsl colour into hex', () => {
    expectSignals('light', sample({ level: 1, colour: 'hsl(0, 100%, 50%)' }), {
      ...ON,
      brightness: 1,
      colour: '#ff0000',
    });
  });

  it('is white when no colour is reported', () => {
    expectSignals('light', sample({ level: 0.5 }), { ...ON, brightness: 0.5 });
  });

  it('is off', () => {
    expectSignals('light', sample({ power: 'off', colour: '#336699' }), {
      power: false,
      online: true,
      brightness: 0.6,
      colour: '#336699',
    });
  });

  it('is offline', () => {
    expectSignals('light', sample({ power: 'unknown', online: false }), {
      power: false,
      online: false,
      brightness: 0.6,
    });
  });
});

describe('hexOf', () => {
  it('rejects text that is not a colour', () => {
    expect(hexOf('not a colour')).toBeUndefined();
    expect(hexOf(null)).toBeUndefined();
  });

  it('drops the alpha channel', () => {
    expect(hexOf('rgba(255, 0, 0, 0.5)')).toBe('#ff0000');
  });
});
