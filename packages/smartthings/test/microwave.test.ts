import { MICROWAVE_KEYS, type JsonValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { refineMicrowaveBinding } from '../src/microwave-bindings';
import { refineRawBinding, validateRawWrite } from '../src/raw-refinement';
import { SmartThingsCommandError } from '../src/errors';
import { READY, bindingDescriptor, microwaveOf, writeAttempt } from './microwave-fixture';

const START = MICROWAVE_KEYS.start;
const GENERIC_START = 'raw:oven_operating_state:start';
const MACHINE_STATE = 'raw:oven_operating_state.machine_state';
const LAMP = 'raw:samsungce.lamp.brightness_level';

function refusal(attempt: () => unknown): string {
  try {
    attempt();
  } catch (cause) {
    if (cause instanceof SmartThingsCommandError) {
      return cause.reason;
    }
    throw cause;
  }
  return 'accepted';
}

describe('microwave descriptors', () => {
  const mapped = microwaveOf(READY);

  it('offers the temperature range and power levels the appliance reports', () => {
    expect(bindingDescriptor(mapped, MICROWAVE_KEYS.temperature)).toEqual({
      kind: 'number',
      min: 100,
      max: 250,
      step: 5,
      unit: 'C',
    });
    expect(bindingDescriptor(mapped, MICROWAVE_KEYS.power)).toEqual({
      kind: 'enum',
      options: ['100%', '50%'],
    });
  });

  it('offers the modes and light settings the appliance reports', () => {
    expect(bindingDescriptor(mapped, MICROWAVE_KEYS.mode)).toEqual({
      kind: 'enum',
      options: ['MicroWave', 'Convection', 'Grill'],
    });
    expect(bindingDescriptor(mapped, LAMP)).toEqual({ kind: 'enum', options: ['off', 'high'] });
  });

  it('describes the writable programs as actions with a schema derived from the checker', () => {
    expect(bindingDescriptor(mapped, MICROWAVE_KEYS.setDuration)).toMatchObject({
      kind: 'action',
      arguments: ['operationTime'],
      argumentSchema: { type: 'object', required: ['operationTime'] },
    });
    expect(bindingDescriptor(mapped, MICROWAVE_KEYS.definedRecipe)).toMatchObject({
      kind: 'action',
      arguments: [
        'recipeType',
        'categoryId',
        'itemId',
        'servingSize',
        'cavityId',
        'browingLevel',
        'option',
      ],
    });
  });

  it('only lets the machine state be set to stop', () => {
    expect(bindingDescriptor(mapped, MACHINE_STATE)).toEqual({ kind: 'enum', options: ['stop'] });
  });

  it('keeps plain descriptors when the appliance reports no light settings', () => {
    const plain = microwaveOf({ ...READY, lamp: null });
    expect(bindingDescriptor(plain, LAMP)).toMatchObject({ kind: 'text' });
  });

  it('leaves devices that are not microwaves alone', () => {
    const oven = microwaveOf({ ...READY, type: 'oven' });
    expect(bindingDescriptor(oven, MICROWAVE_KEYS.temperature)).toMatchObject({ kind: 'text' });
    expect(bindingDescriptor(oven, MACHINE_STATE)).toMatchObject({ kind: 'text' });
  });

  it('keeps the original descriptor when the specification is missing or the write is read-only', () => {
    const main = mapped.status['main'];
    const temperature = mapped.bindings.find(
      (binding) => binding.capability.key === MICROWAVE_KEYS.temperature,
    );
    const power = mapped.bindings.find(
      (binding) => binding.capability.key === MICROWAVE_KEYS.power,
    );
    const recipe = mapped.bindings.find(
      (binding) => binding.capability.key === MICROWAVE_KEYS.definedRecipe,
    );
    if (
      main === undefined ||
      temperature === undefined ||
      power === undefined ||
      recipe === undefined
    ) {
      throw new Error('fixture lost a binding');
    }
    const { 'samsungce.kitchenModeSpecification': _, ...withoutSpecification } = main;
    const raw = {
      ...temperature,
      capability: { ...temperature.capability, key: MICROWAVE_KEYS.temperature },
    };
    expect(refineMicrowaveBinding(raw, withoutSpecification)).toBe(raw);
    expect(refineRawBinding(raw, withoutSpecification).capability.value).toEqual(
      raw.capability.value,
    );
    const rawPower = {
      ...power,
      capability: { ...power.capability, key: MICROWAVE_KEYS.power },
    };
    expect(refineMicrowaveBinding(rawPower, withoutSpecification).capability.value).toEqual({
      kind: 'enum',
      options: ['100%', '50%'],
    });
    const { 'samsungce.microwavePower': __, ...withoutPower } = withoutSpecification;
    expect(refineMicrowaveBinding(rawPower, withoutPower)).toBe(rawPower);
    const readOnly = {
      ...recipe,
      capability: { ...recipe.capability, key: MICROWAVE_KEYS.definedRecipe },
      write: null,
    };
    expect(refineMicrowaveBinding(readOnly, main)).toBe(readOnly);
  });
});

describe('microwave cooking writes', () => {
  it('starts in a mode that starts remotely and refuses one that does not', () => {
    expect(writeAttempt(microwaveOf(READY), START, null)).toEqual([
      { component: 'main', capability: 'samsungce.ovenOperatingState', command: 'start' },
    ]);
    expect(
      refusal(() => writeAttempt(microwaveOf({ ...READY, mode: 'Convection' }), START, null)),
    ).toBe('accepted');
    expect(refusal(() => writeAttempt(microwaveOf({ ...READY, mode: 'Grill' }), START, null))).toBe(
      'this mode starts on the appliance',
    );
    expect(
      refusal(() => writeAttempt(microwaveOf({ ...READY, mode: 'Mystery' }), START, null)),
    ).toBe('current mode has no specification');
  });

  it('refuses to start when the appliance reports no current mode', () => {
    const mapped = microwaveOf(READY);
    const main = mapped.status['main'];
    const start = mapped.bindings.find((binding) => binding.capability.key === START);
    if (main === undefined || start === undefined) {
      throw new Error('fixture lost a binding');
    }
    const { 'samsungce.ovenMode': _, ...withoutMode } = main;
    expect(
      refusal(() => {
        validateRawWrite(start, withoutMode, null);
      }),
    ).toBe('current mode has no specification');
  });

  it('says what to fix before starting', () => {
    expect(
      refusal(() => writeAttempt(microwaveOf({ ...READY, remote: 'false' }), START, null)),
    ).toBe('Turn on remote control on the microwave.');
    expect(refusal(() => writeAttempt(microwaveOf({ ...READY, door: 'open' }), START, null))).toBe(
      'Close the microwave door.',
    );
    expect(
      refusal(() => writeAttempt(microwaveOf({ ...READY, lock: 'locked' }), START, null)),
    ).toBe('Unlock the controls on the microwave.');
  });

  it('stops and pauses with the door open but not without remote control', () => {
    const open = microwaveOf({ ...READY, door: 'open', lock: 'locked' });
    expect(refusal(() => writeAttempt(open, MICROWAVE_KEYS.stop, null))).toBe('accepted');
    expect(refusal(() => writeAttempt(open, MICROWAVE_KEYS.pause, null))).toBe('accepted');
    expect(refusal(() => writeAttempt(open, MACHINE_STATE, 'stop'))).toBe('accepted');
    const remoteOff = microwaveOf({ ...READY, remote: 'false' });
    expect(refusal(() => writeAttempt(remoteOff, MICROWAVE_KEYS.stop, null))).toBe(
      'Turn on remote control on the microwave.',
    );
  });

  it('checks the cooking time against the current mode', () => {
    const mapped = microwaveOf(READY);
    expect(writeAttempt(mapped, MICROWAVE_KEYS.setDuration, { operationTime: '00:01:30' })).toEqual(
      [
        {
          component: 'main',
          capability: 'samsungce.ovenOperatingState',
          command: 'setOperationTime',
          arguments: ['00:01:30'],
        },
      ],
    );
    expect(
      refusal(() =>
        writeAttempt(mapped, MICROWAVE_KEYS.setDuration, { operationTime: '00:00:05' }),
      ),
    ).toBe('Use 00:00:10–01:30:00, in 00:00:10 steps.');
    expect(() =>
      writeAttempt(mapped, MICROWAVE_KEYS.setDuration, { operationTime: 'soon' }),
    ).toThrow();
    expect(
      refusal(() =>
        writeAttempt(microwaveOf({ ...READY, mode: 'Grill' }), MICROWAVE_KEYS.setDuration, {
          operationTime: '00:01:00',
        }),
      ),
    ).toBe('This mode does not support a duration.');
  });

  it('refuses in plain words while the appliance has not reported its cooking modes', () => {
    const mapped = microwaveOf(READY);
    const binding = mapped.bindings.find(
      (entry) => entry.capability.key === MICROWAVE_KEYS.setDuration,
    );
    const main = mapped.status['main'];
    if (binding === undefined || main === undefined) {
      throw new Error('fixture lost a binding');
    }
    const { 'samsungce.kitchenModeSpecification': _, ...withoutSpecification } = main;
    expect(
      refusal(() => {
        validateRawWrite(binding, withoutSpecification, { operationTime: '00:01:00' });
      }),
    ).toBe('the microwave has not reported its cooking modes');
  });

  it('checks the temperature against the current mode', () => {
    const convection = microwaveOf({ ...READY, mode: 'Convection' });
    expect(refusal(() => writeAttempt(convection, MICROWAVE_KEYS.temperature, 160))).toBe(
      'accepted',
    );
    expect(refusal(() => writeAttempt(convection, MICROWAVE_KEYS.temperature, 163))).toBe(
      'Use 100–220 C, in 5-degree steps.',
    );
    expect(refusal(() => writeAttempt(microwaveOf(READY), MICROWAVE_KEYS.temperature, 160))).toBe(
      'This mode does not support temperature.',
    );
  });

  it('checks the power against what the mode and the appliance support', () => {
    expect(refusal(() => writeAttempt(microwaveOf(READY), MICROWAVE_KEYS.power, '50%'))).toBe(
      'accepted',
    );
    expect(refusal(() => writeAttempt(microwaveOf(READY), MICROWAVE_KEYS.power, '10%'))).toBe(
      'This power is not supported by the current mode.',
    );
    expect(
      refusal(() =>
        writeAttempt(microwaveOf({ ...READY, power: ['100%'] }), MICROWAVE_KEYS.power, '50%'),
      ),
    ).toBe('This power is not supported by the current mode.');
    expect(
      refusal(() =>
        writeAttempt(microwaveOf({ ...READY, mode: 'Convection' }), MICROWAVE_KEYS.power, '50%'),
      ),
    ).toBe('This power is not supported by the current mode.');
  });

  it('accepts the mode power when the appliance does not report its own list', () => {
    const unreported = microwaveOf({ ...READY, power: null });
    expect(refusal(() => writeAttempt(unreported, MICROWAVE_KEYS.power, '50%'))).toBe('accepted');
    expect(
      refusal(() =>
        writeAttempt(
          microwaveOf({ ...READY, power: null, mode: 'Convection' }),
          MICROWAVE_KEYS.power,
          '50%',
        ),
      ),
    ).toBe('This power is not supported by the current mode.');
  });

  it('starts with the generic command after checking the requested program', () => {
    const mapped = microwaveOf(READY);
    expect(writeAttempt(mapped, GENERIC_START, { mode: 'Bake', time: 600, setpoint: 160 })).toEqual(
      [
        {
          component: 'main',
          capability: 'ovenOperatingState',
          command: 'start',
          arguments: ['Bake', 600, 160],
        },
      ],
    );
    expect(refusal(() => writeAttempt(mapped, GENERIC_START, {}))).toBe('accepted');
    expect(refusal(() => writeAttempt(mapped, GENERIC_START, { mode: 'Broil' }))).toContain(
      'cannot start remotely',
    );
    expect(refusal(() => writeAttempt(mapped, GENERIC_START, { mode: 'Unheard' }))).toContain(
      'cannot start remotely',
    );
    expect(refusal(() => writeAttempt(mapped, GENERIC_START, { time: 5 }))).toContain(
      'Use 00:00:10',
    );
    expect(refusal(() => writeAttempt(mapped, GENERIC_START, { setpoint: 160 }))).toContain(
      'does not support temperature',
    );
    expect(() => writeAttempt(mapped, GENERIC_START, { speed: 1 })).toThrow();
  });
});

describe('writes that are not cooking', () => {
  it('validates the light against what the appliance currently reports', () => {
    const mapped = microwaveOf(READY);
    expect(refusal(() => writeAttempt(mapped, LAMP, 'high'))).toBe('accepted');
    expect(refusal(() => writeAttempt(mapped, LAMP, 'dim'))).toContain(
      'currently supports (off, high)',
    );
    expect(refusal(() => writeAttempt(mapped, LAMP, 3))).toContain('currently supports');
  });

  it('accepts any light setting when none are reported', () => {
    expect(refusal(() => writeAttempt(microwaveOf({ ...READY, lamp: null }), LAMP, 'dim'))).toBe(
      'accepted',
    );
  });

  it('checks against the live status, not the status the device was mapped with', () => {
    const mapped = microwaveOf(READY);
    const later = microwaveOf({ ...READY, lamp: ['off', 'dim'] });
    const binding = mapped.bindings.find((entry) => entry.capability.key === LAMP);
    const main = later.status['main'];
    if (binding === undefined || main === undefined) {
      throw new Error('fixture lost a binding');
    }
    const check = (value: JsonValue): string =>
      refusal(() => {
        validateRawWrite(binding, main, value);
      });
    expect(check('dim')).toBe('accepted');
    expect(check('high')).toContain('currently supports (off, dim)');
  });

  it('does not apply cooking checks to other kinds of device', () => {
    const oven = microwaveOf({ ...READY, type: 'oven', door: 'open' });
    expect(refusal(() => writeAttempt(oven, START, null))).toBe('accepted');
  });

  it('does not apply cooking checks to updates', () => {
    const mapped = microwaveOf({ ...READY, door: 'open' });
    expect(writeAttempt(mapped, MICROWAVE_KEYS.agreeUpdate, { module: 'main' })).toEqual([
      {
        component: 'main',
        capability: 'samsungce.softwareUpdate',
        command: 'agreeUpdate',
        arguments: ['main'],
      },
    ]);
    expect(() => writeAttempt(mapped, MICROWAVE_KEYS.agreeUpdate, { module: 1 })).toThrow();
  });
});
