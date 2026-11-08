import { DEFAULT_VACUUM_FINISH, MAX_BELT_KMH } from '@smarteverything/domain';
import { describe, it } from 'vitest';
import type { VisualState } from '../types';
import { ON, expectSignals, sample } from './signals-of-fixtures';

type Vacuum = NonNullable<VisualState['vacuum']>;
type Treadmill = NonNullable<VisualState['treadmill']>;
type Printer = NonNullable<VisualState['printer']>;
type Bottle = NonNullable<VisualState['bottle']>;
type Toothbrush = NonNullable<VisualState['toothbrush']>;

const VACUUM: Vacuum = {
  scene: 'both',
  phase: 'idle',
  station: null,
  stationProgress: null,
  online: true,
  asleep: false,
  lifted: false,
  lidarUp: false,
  finish: DEFAULT_VACUUM_FINISH,
  cleanTank: null,
  dirtyTank: null,
  bag: null,
  battery: null,
};

const TREADMILL: Treadmill = {
  belt: 'idle',
  link: 'linked',
  speedKmh: 0,
  zone: 'walk',
  timeS: 0,
  distanceM: 0,
  fault: null,
  childLock: false,
  cadence: null,
  inclineGrade: 0,
  inclineLabel: null,
  inclineMoving: null,
  heartZone: null,
};

const PRINTER: Printer = {
  variant: 'inkjet',
  mfp: false,
  phase: 'idle',
  progress: 0,
  part: null,
  inks: [],
  waste: null,
  paper: null,
  output: 0,
  identify: false,
};

const BOTTLE: Bottle = {
  fill: null,
  reliable: true,
  light: 'off',
  uvMode: null,
  battery: null,
  filter: false,
  searching: false,
  syncing: false,
  tilt: 'upright',
};

const BRUSH: Toothbrush = {
  brand: 'oralb',
  activity: 'standby',
  link: 'linked',
  mode: null,
  intensity: null,
  pressure: null,
  head: null,
  headType: null,
  wear: null,
  battery: null,
  fault: false,
  ring: null,
  face: null,
  sector: null,
  daysLeftRatio: null,
  elapsedS: null,
  display: false,
  handle: null,
};

function vacuum(changes: Partial<Vacuum>): VisualState {
  return sample({ vacuum: { ...VACUUM, ...changes } });
}

function treadmill(changes: Partial<Treadmill>): VisualState {
  return sample({ treadmill: { ...TREADMILL, ...changes } });
}

function printer(changes: Partial<Printer>): VisualState {
  return sample({ printer: { ...PRINTER, ...changes } });
}

function bottle(changes: Partial<Bottle>): VisualState {
  return sample({ bottle: { ...BOTTLE, ...changes } });
}

function brush(changes: Partial<Toothbrush>): VisualState {
  return sample({ toothbrush: { ...BRUSH, ...changes } });
}

const DOCKED = { lidarRaised: false, lifted: false, batteryLow: false } as const;

describe('vacuum', () => {
  it('cleans with its battery', () => {
    expectSignals('vacuum', vacuum({ phase: 'cleaning', battery: 0.7 }), {
      ...ON,
      ...DOCKED,
      phase: 'cleaning',
      charging: false,
      fault: false,
      battery: 0.7,
    });
  });

  it('mops with its pads down and the LiDAR raised', () => {
    expectSignals('vacuum', vacuum({ phase: 'mopping', lidarUp: true, battery: 0.6 }), {
      ...ON,
      ...DOCKED,
      phase: 'mopping',
      cleanMode: 'mop',
      lidarRaised: true,
      charging: false,
      fault: false,
      battery: 0.6,
    });
  });

  it('warns about a low battery', () => {
    expectSignals('vacuum', vacuum({ phase: 'idle', battery: 0.1 }), {
      ...ON,
      ...DOCKED,
      phase: 'idle',
      batteryLow: true,
      charging: false,
      fault: false,
      battery: 0.1,
    });
  });

  it('charges on the dock while the station washes the mop', () => {
    expectSignals(
      'vacuum',
      vacuum({
        phase: 'charging',
        station: 'wash_mop',
        stationProgress: 0.5,
        cleanTank: 0.8,
        dirtyTank: 0.3,
        battery: 0.4,
      }),
      {
        ...ON,
        ...DOCKED,
        phase: 'charging',
        mode: 'wash_mop',
        progress: 0.5,
        charging: true,
        fault: false,
        battery: 0.4,
        waterLevel: 0.8,
        fill: 0.3,
      },
    );
  });

  it('is lifted and faults when picked up, and faults in error', () => {
    expectSignals('vacuum', vacuum({ phase: 'paused', lifted: true }), {
      ...ON,
      ...DOCKED,
      lifted: true,
      phase: 'paused',
      charging: false,
      fault: true,
    });
    expectSignals('vacuum', vacuum({ phase: 'error' }), {
      ...ON,
      ...DOCKED,
      phase: 'error',
      charging: false,
      fault: true,
    });
  });

  it('neither faults nor reports its pose while offline', () => {
    expectSignals(
      'vacuum',
      vacuum({ online: false, phase: 'error', lifted: true, lidarUp: true, battery: 0.1 }),
      {
        ...ON,
        ...DOCKED,
        phase: 'error',
        charging: false,
        fault: false,
        battery: 0.1,
      },
    );
  });

  it('works before its facts arrive', () => {
    expectSignals('vacuum', sample({}), ON);
  });
});

describe('robot', () => {
  it.each(['awake', 'listening', 'speaking', 'worried', 'asleep'] as const)('is %s', (mood) => {
    expectSignals('robot', sample({ robot: { mood, onBase: null, move: null } }), {
      ...ON,
      phase: mood,
    });
  });

  it('works before its facts arrive', () => {
    expectSignals('robot', sample({}), ON);
  });
});

describe('treadmill', () => {
  it('runs at a share of the top belt speed on an incline', () => {
    expectSignals(
      'treadmill',
      treadmill({ belt: 'running', speedKmh: MAX_BELT_KMH / 2, zone: 'jog', inclineGrade: 10 }),
      {
        ...ON,
        phase: 'running',
        speed: 0.5,
        incline: (Math.atan(0.1) * 180) / Math.PI,
        fault: false,
        locked: false,
        mode: 'jog',
      },
    );
  });

  it('keeps the speed inside 0 to 1', () => {
    expectSignals('treadmill', treadmill({ belt: 'running', speedKmh: MAX_BELT_KMH * 2 }), {
      ...ON,
      phase: 'running',
      speed: 1,
      incline: 0,
      fault: false,
      locked: false,
      mode: 'walk',
    });
  });

  it('faults and locks', () => {
    expectSignals('treadmill', treadmill({ belt: 'fault', childLock: true }), {
      ...ON,
      phase: 'fault',
      speed: 0,
      incline: 0,
      fault: true,
      locked: true,
      mode: 'walk',
    });
    expectSignals('treadmill', treadmill({ fault: 'E3' }), {
      ...ON,
      phase: 'idle',
      speed: 0,
      incline: 0,
      fault: true,
      locked: false,
      mode: 'walk',
    });
  });
});

describe('printer', () => {
  it('prints with the lowest ink level', () => {
    expectSignals(
      'printer',
      printer({
        phase: 'printing',
        progress: 0.4,
        inks: [
          { colour: '#000000', share: 0.9, warn: false },
          { colour: '#00ffff', share: 0.15, warn: true },
          { colour: '#ff00ff', share: null, warn: false },
        ],
      }),
      {
        ...ON,
        phase: 'printing',
        progress: 0.4,
        inkLevels: 0.15,
        alarm: true,
        fault: false,
      },
    );
  });

  it('is stopped', () => {
    expectSignals('printer', printer({ phase: 'stopped' }), {
      ...ON,
      phase: 'stopped',
      progress: 0,
      alarm: false,
      fault: true,
    });
  });

  it('leaves the ink out when no level is known', () => {
    expectSignals(
      'printer',
      printer({ phase: 'asleep', inks: [{ colour: '#000', share: null, warn: false }] }),
      {
        ...ON,
        phase: 'asleep',
        progress: 0,
        alarm: false,
        fault: false,
      },
    );
  });
});

describe('bottle', () => {
  it('sterilises with UV in a mode', () => {
    expectSignals(
      'bottle',
      bottle({ light: 'uv', uvMode: 'adventure', fill: 0.5, battery: 80, tilt: 'tilted' }),
      {
        ...ON,
        phase: 'uv',
        fill: 0.5,
        uv: true,
        mode: 'adventure',
        tilt: 24,
        battery: 0.8,
        charging: false,
        fault: false,
        locked: false,
      },
    );
  });

  it.each([
    ['charging', { charging: true }],
    ['fault', { fault: true }],
    ['locked', { locked: true }],
  ] as const)('lights %s', (light, expected) => {
    expectSignals('bottle', bottle({ light, tilt: 'side' }), {
      ...ON,
      phase: light,
      uv: false,
      tilt: 82,
      charging: false,
      fault: false,
      locked: false,
      ...expected,
    });
  });
});

describe('toothbrush', () => {
  it('brushes in a mode and warns about too much pressure', () => {
    expectSignals(
      'toothbrush',
      brush({ activity: 'brushing', mode: 'daily_clean', pressure: 'too_high', battery: 45 }),
      {
        ...ON,
        phase: 'brushing',
        mode: 'daily_clean',
        battery: 0.45,
        charging: false,
        fault: false,
        alarm: true,
      },
    );
  });

  it('charges', () => {
    expectSignals('toothbrush', brush({ activity: 'charging', battery: 100 }), {
      ...ON,
      phase: 'charging',
      battery: 1,
      charging: true,
      fault: false,
      alarm: false,
    });
  });

  it('faults', () => {
    expectSignals('toothbrush', brush({ activity: 'off', fault: true }), {
      ...ON,
      phase: 'off',
      charging: false,
      fault: true,
      alarm: false,
    });
  });
});

describe('file_sync', () => {
  it('syncs', () => {
    expectSignals('file_sync', sample({ syncing: true }), { ...ON, phase: 'syncing' });
  });

  it('rests', () => {
    expectSignals('file_sync', sample({}), { ...ON, phase: 'idle' });
  });
});
