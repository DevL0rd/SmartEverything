import { describe, expect, it } from 'vitest';
import {
  MICROWAVE_COOK_RECIPE,
  MICROWAVE_DEFINED_RECIPE,
  MICROWAVE_KEYS,
  MICROWAVE_UPDATE_SCHEDULE,
  microwaveDuration,
  microwaveModes,
  microwavePowerOptions,
  microwaveProgramError,
  microwaveReadiness,
  microwaveRemoteReason,
  microwaveRemoteState,
  microwaveStartable,
  microwaveRecipeLabel,
  microwaveReadyAt,
  microwaveRemaining,
  microwaveSecondsLeft,
  microwaveSeconds,
  microwaveStageLabel,
  type JsonValue,
  type MicrowaveMode,
} from '../src';

const SPECIFICATION = {
  single: [
    {
      mode: 'MicroWave',
      supportedOperations: ['start', 'stop'],
      supportedOptions: {
        operationTime: {
          min: '00:00:10',
          max: '01:30:00',
          default: '00:01:00',
          resolution: '00:00:10',
        },
        powerLevel: { default: '100%', supportedValues: ['100%', '50%'] },
      },
    },
    {
      mode: 'Convection',
      supportedOperations: ['start'],
      supportedOptions: { temperature: { C: { min: 100, max: 220, default: 160, resolution: 5 } } },
    },
  ],
} satisfies JsonValue;

function modeOf(name: string): MicrowaveMode {
  const mode = microwaveModes(SPECIFICATION, ['MicroWave', 'Convection']).find(
    (entry) => entry.mode === name,
  );
  if (mode === undefined) {
    throw new Error(`no mode ${name}`);
  }
  return mode;
}

describe('microwave durations', () => {
  it('converts between seconds and hours:minutes:seconds', () => {
    expect(microwaveSeconds('01:02:03')).toBe(3723);
    expect(microwaveDuration(3723)).toBe('01:02:03');
    expect(microwaveDuration(59)).toBe('00:00:59');
  });
});

describe('microwave modes', () => {
  it('lists the modes the appliance both specifies and supports', () => {
    expect(microwaveModes(SPECIFICATION, ['Convection', 'Grill']).map((mode) => mode.mode)).toEqual(
      ['Convection'],
    );
    expect(microwaveModes(undefined, ['MicroWave'])).toEqual([]);
    expect(microwaveModes(SPECIFICATION, undefined)).toEqual([]);
  });

  it('offers the power levels the mode and the appliance share', () => {
    expect(microwavePowerOptions(modeOf('MicroWave'), ['50%', '10%'])).toEqual(['50%']);
    expect(microwavePowerOptions(modeOf('MicroWave'), undefined)).toEqual([]);
    expect(microwavePowerOptions(modeOf('Convection'), ['50%'])).toEqual([]);
  });
});

describe('microwave readiness', () => {
  const ready = {
    [MICROWAVE_KEYS.remote]: 'true',
    [MICROWAVE_KEYS.door]: 'closed',
    [MICROWAVE_KEYS.lock]: 'unlocked',
  };

  it('is ready when remote control is on, the door is closed and the controls are unlocked', () => {
    expect(microwaveReadiness(ready)).toBeNull();
  });

  it('names the first thing in the way', () => {
    expect(microwaveReadiness({ ...ready, [MICROWAVE_KEYS.remote]: 'false' })).toBe(
      'Turn on remote control on the microwave.',
    );
    expect(microwaveReadiness({ ...ready, [MICROWAVE_KEYS.door]: 'open' })).toBe(
      'Close the microwave door.',
    );
    expect(microwaveReadiness({ ...ready, [MICROWAVE_KEYS.lock]: 'locked' })).toBe(
      'Unlock the controls on the microwave.',
    );
  });
});

describe('microwave program checks', () => {
  const timed = { mode: 'MicroWave', duration: '00:01:00', power: '50%', temperature: 0 };

  it('accepts a program the mode allows', () => {
    expect(microwaveProgramError(timed, modeOf('MicroWave'), ['100%', '50%'], 'C')).toBeNull();
    expect(
      microwaveProgramError(
        { ...timed, mode: 'Convection', temperature: 160 },
        modeOf('Convection'),
        [],
        'C',
      ),
    ).toBeNull();
  });

  it('explains a duration that is malformed or off the steps', () => {
    expect(
      microwaveProgramError({ ...timed, duration: 'a minute' }, modeOf('MicroWave'), ['50%'], 'C'),
    ).toBe('Enter the duration as hours:minutes:seconds.');
    expect(
      microwaveProgramError({ ...timed, duration: '00:00:15' }, modeOf('MicroWave'), ['50%'], 'C'),
    ).toBe('Use 00:00:10–01:30:00, in 00:00:10 steps.');
    expect(
      microwaveProgramError({ ...timed, duration: '02:00:00' }, modeOf('MicroWave'), ['50%'], 'C'),
    ).toBe('Use 00:00:10–01:30:00, in 00:00:10 steps.');
  });

  it('asks for a supported power level', () => {
    expect(
      microwaveProgramError({ ...timed, power: '10%' }, modeOf('MicroWave'), ['50%'], 'C'),
    ).toBe('Choose a supported power level.');
  });

  it('explains a temperature outside the range or off the steps', () => {
    const convection = { mode: 'Convection', duration: '00:00:00', power: '', temperature: 163 };
    expect(microwaveProgramError(convection, modeOf('Convection'), [], 'C')).toBe(
      'Use 100–220 C, in 5-degree steps.',
    );
    expect(
      microwaveProgramError({ ...convection, temperature: 300 }, modeOf('Convection'), [], 'C'),
    ).toBe('Use 100–220 C, in 5-degree steps.');
    expect(
      microwaveProgramError({ ...convection, temperature: 163 }, modeOf('Convection'), [], 'F'),
    ).toBeNull();
  });
});

describe('microwave readings', () => {
  it('labels the current recipe', () => {
    expect(microwaveRecipeLabel({ menu: 'Pizza', option: 'Thin', servingSize: '2' })).toBe(
      'Pizza · Thin · 2',
    );
    expect(microwaveRecipeLabel({ menu: 'Pizza', option: '' })).toBe('Pizza');
    expect(microwaveRecipeLabel({ menu: '' })).toBe('No recipe selected');
    expect(microwaveRecipeLabel({})).toBe('No recipe selected');
  });

  it('labels the recipe stage', () => {
    expect(microwaveStageLabel({})).toBe('No active recipe stage');
    expect(microwaveStageLabel({ currentStage: {} })).toBe('Current stage');
    expect(
      microwaveStageLabel({ currentStage: { stageNumber: 2, remainingTime: '00:01:00' } }),
    ).toBe('Stage 2 · 00:01:00 remaining');
  });

  it('reports the time left only while cooking', () => {
    const stage = { currentStage: { remainingTime: '00:00:30' } };
    expect(
      microwaveRemaining({
        [MICROWAVE_KEYS.state]: 'running',
        [MICROWAVE_KEYS.stageStatus]: stage,
      }),
    ).toBe('00:00:30');
    expect(
      microwaveRemaining({ [MICROWAVE_KEYS.state]: 'paused', [MICROWAVE_KEYS.stageStatus]: {} }),
    ).toBeNull();
    expect(
      microwaveRemaining({ [MICROWAVE_KEYS.state]: 'ready', [MICROWAVE_KEYS.stageStatus]: stage }),
    ).toBeNull();
    expect(microwaveRemaining({ [MICROWAVE_KEYS.state]: 'running' })).toBeNull();
  });
});

describe('microwave recipe arguments', () => {
  it('accepts a saved recipe and rejects bytes out of range or unknown fields', () => {
    const recipe = { recipeType: 'normal', categoryId: 1, itemId: 2, servingSize: 3 };
    expect(MICROWAVE_DEFINED_RECIPE.parse(recipe)).toEqual(recipe);
    expect(() => MICROWAVE_DEFINED_RECIPE.parse({ ...recipe, itemId: 300 })).toThrow();
    expect(() => MICROWAVE_DEFINED_RECIPE.parse({ ...recipe, extra: 1 })).toThrow();
  });

  it('accepts a staged recipe', () => {
    const staged = {
      recipeType: 'normal',
      recipeStages: { accessories: ['none'], stages: [{ mode: 'MicroWave' }] },
      recipeDisplay: { language: 'en_US', menu: 'Soup' },
      recipeZones: { zone1: 'left' },
    };
    expect(MICROWAVE_COOK_RECIPE.parse(staged)).toEqual(staged);
    expect(() => MICROWAVE_COOK_RECIPE.parse({ ...staged, recipeZones: { top: 'x' } })).toThrow();
  });

  it('takes a software update time with an offset', () => {
    expect(
      MICROWAVE_UPDATE_SCHEDULE.parse({ scheduledTime: '2026-10-17T03:00:00+07:00' }),
    ).toBeDefined();
    expect(() => MICROWAVE_UPDATE_SCHEDULE.parse({ scheduledTime: 'tonight' })).toThrow();
  });
});

describe('microwave remote state', () => {
  const ready = {
    [MICROWAVE_KEYS.remote]: 'true',
    [MICROWAVE_KEYS.door]: 'closed',
    [MICROWAVE_KEYS.lock]: 'unlocked',
  };
  const startsRemotely = { supportedOperations: ['start', 'set'] };
  const setOnly = { supportedOperations: ['set'] };

  it('tells which modes the appliance lets the app start', () => {
    expect(microwaveStartable(startsRemotely)).toBe(true);
    expect(microwaveStartable(setOnly)).toBe(false);
    expect(microwaveStartable({ supportedOperations: [] })).toBe(false);
  });

  it('offers start for modes that start remotely when everything is ready', () => {
    expect(microwaveRemoteState(ready, startsRemotely)).toEqual({ actions: 'start', reason: null });
  });

  it('only sets power modes and says the start is pressed on the microwave', () => {
    expect(microwaveRemoteState(ready, setOnly)).toEqual({
      actions: 'set',
      reason: 'Press Start on the microwave.',
    });
  });

  it('replaces every action with the reason when remote control is off', () => {
    const off = { ...ready, [MICROWAVE_KEYS.remote]: 'false' };
    expect(microwaveRemoteReason(off)).toBe('Turn on remote control on the microwave.');
    expect(microwaveRemoteState(off, startsRemotely)).toEqual({
      actions: 'none',
      reason: 'Turn on remote control on the microwave.',
    });
    expect(microwaveRemoteState(off, setOnly).actions).toBe('none');
    expect(microwaveRemoteReason(ready)).toBeNull();
  });

  it('names an open door or locked controls once remote control is on', () => {
    expect(microwaveRemoteState({ ...ready, [MICROWAVE_KEYS.door]: 'open' }, setOnly)).toEqual({
      actions: 'none',
      reason: 'Close the microwave door.',
    });
    expect(
      microwaveRemoteState({ ...ready, [MICROWAVE_KEYS.lock]: 'locked' }, startsRemotely),
    ).toEqual({
      actions: 'none',
      reason: 'Unlock the controls on the microwave.',
    });
  });
});

describe('microwave countdown', () => {
  const RUNNING = {
    [MICROWAVE_KEYS.state]: 'running',
    [MICROWAVE_KEYS.duration]: '00:06:00',
    [MICROWAVE_KEYS.progress]: 30,
  };

  it('counts down from the programmed time and the progress when no recipe stage reports', () => {
    expect(microwaveSecondsLeft(RUNNING)).toBe(252);
  });

  it('prefers the time the recipe stage reports', () => {
    const staged = {
      ...RUNNING,
      [MICROWAVE_KEYS.stageStatus]: { currentStage: { remainingTime: '00:04:12' } },
    };
    expect(microwaveSecondsLeft(staged)).toBe(252);
    expect(
      microwaveSecondsLeft({
        ...staged,
        [MICROWAVE_KEYS.stageStatus]: { currentStage: { remainingTime: '00:03:00' } },
      }),
    ).toBe(180);
  });

  it('keeps the time left while paused and reports none when idle or unreadable', () => {
    expect(microwaveSecondsLeft({ ...RUNNING, [MICROWAVE_KEYS.state]: 'paused' })).toBe(252);
    expect(microwaveSecondsLeft({ ...RUNNING, [MICROWAVE_KEYS.state]: 'ready' })).toBeNull();
    expect(microwaveSecondsLeft({ [MICROWAVE_KEYS.state]: 'running' })).toBeNull();
  });

  it('reads the completion time as a moment', () => {
    expect(microwaveReadyAt({ [MICROWAVE_KEYS.completion]: '2026-10-18T07:36:00.000Z' })).toBe(
      Date.parse('2026-10-18T07:36:00.000Z'),
    );
    expect(microwaveReadyAt({ [MICROWAVE_KEYS.completion]: 'soon' })).toBeNull();
    expect(microwaveReadyAt({})).toBeNull();
  });
});
