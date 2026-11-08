import {
  CommandRefusedError,
  EMPTY_IR_REMOTE_STATE,
  type IrApplianceApply,
  type IrRemoteState,
} from '@smarteverything/domain';
import { pulsesFromBase64, type LibraryClimate } from '@smarteverything/tuya';
import { describe, expect, it } from 'vitest';
import { IrEncoders, LEARNED_KEYS_ENCODER } from '../../src/infrared/encoders';
import { libraryEncoders } from '../../src/infrared/library/climate-encoder';
import { IrLibrary, IrLibraryEntryUnknownError } from '../../src/infrared/library/ir-library';

const MODEL: LibraryClimate = {
  kind: 'climate',
  minTemperature: 18,
  maxTemperature: 26,
  precision: 1,
  off: 'OFF',
  commands: {
    cool: {
      low: { '24': 'COOL-LOW-24', '25': 'COOL-LOW-25' },
      mid: { '24': 'COOL-MID-24' },
      high: { '24': 'COOL-HIGH-24' },
      auto: { '24': 'COOL-AUTO-24' },
    },
    fan_only: { low: 'FAN-LOW', high: 'FAN-HIGH' },
    heat_cool: { auto: { '24': 'AUTO-24' } },
  },
};

const encoders = new IrEncoders([LEARNED_KEYS_ENCODER], [libraryEncoders({ model: () => MODEL })]);

const COOLING: IrRemoteState = {
  ...EMPTY_IR_REMOTE_STATE,
  on: true,
  mode: 'Cool',
  temp: 24,
  speed: 1,
};

function sent(from: IrRemoteState, goal: IrApplianceApply): string[] {
  return encoders
    .of('library:smartir:climate:1')
    .frames([], from, goal)
    .map((frame) => frame.code);
}

function refusal(from: IrRemoteState, goal: IrApplianceApply): string {
  try {
    sent(from, goal);
  } catch (error) {
    if (error instanceof CommandRefusedError) {
      return error.message;
    }
    throw error;
  }
  throw new Error('The encoder did not refuse.');
}

describe('the library air conditioner encoder', () => {
  it('sends the one frame that sets mode, temperature and fan together', () => {
    expect(
      sent(EMPTY_IR_REMOTE_STATE, { on: true, mode: 'Cool', temp: 24, speed: 1 }),
    ).toStrictEqual(['COOL-LOW-24']);
    const [frame] = encoders
      .of('library:x')
      .frames([], EMPTY_IR_REMOTE_STATE, { on: true, mode: 'Cool', temp: 24, speed: 1 });
    expect(frame).toStrictEqual({ key: 'Cool 24 fan low', format: 'pulses', code: 'COOL-LOW-24' });
  });

  it('fills what the request leaves out from the assumed state', () => {
    expect(sent(COOLING, { temp: 25 })).toStrictEqual(['COOL-LOW-25']);
    expect(sent(COOLING, { speed: 5 })).toStrictEqual(['COOL-HIGH-24']);
  });

  it('spreads the five fan steps over the speeds the mode has and leaves auto out', () => {
    expect([1, 2, 3, 4, 5].map((speed) => sent(COOLING, { speed })[0])).toStrictEqual([
      'COOL-LOW-24',
      'COOL-MID-24',
      'COOL-MID-24',
      'COOL-HIGH-24',
      'COOL-HIGH-24',
    ]);
  });

  it('sends the off code whatever the assumed state is', () => {
    expect(sent(EMPTY_IR_REMOTE_STATE, { on: false })).toStrictEqual(['OFF']);
    expect(sent({ ...COOLING, on: false }, { on: false })).toStrictEqual(['OFF']);
  });

  it('needs no temperature for a mode whose fan speeds carry one code each', () => {
    expect(sent(COOLING, { mode: 'Fan', speed: 5 })).toStrictEqual(['FAN-HIGH']);
    expect(sent({ ...COOLING, temp: null }, { mode: 'Fan', speed: 1 })).toStrictEqual(['FAN-LOW']);
  });

  it('reaches Auto through the heat_cool commands', () => {
    expect(sent(COOLING, { mode: 'Auto', speed: 1 })).toStrictEqual(['AUTO-24']);
  });

  it('refuses instead of guessing when the power, mode, temperature or fan is not known', () => {
    expect(refusal(EMPTY_IR_REMOTE_STATE, { temp: 24 })).toMatch(/power is not known/);
    expect(refusal({ ...COOLING, on: false }, { temp: 24 })).toMatch(
      /turn it on in the same request/,
    );
    expect(refusal({ ...COOLING, mode: null }, { temp: 24 })).toMatch(/mode is not known/);
    expect(refusal({ ...COOLING, speed: null }, { temp: 24 })).toMatch(/fan speed is not known/);
    expect(refusal({ ...COOLING, temp: null }, { speed: 1 })).toMatch(/temperature is not known/);
  });

  it('names the temperatures and modes the model does not have', () => {
    expect(refusal(COOLING, { temp: 30 })).toMatch(/30 is not a Cool temperature.*18 to 26/);
    expect(refusal(COOLING, { mode: 'Heat' })).toMatch(
      /no Heat mode, its modes are cool, fan_only, heat_cool/,
    );
  });
});

describe('the built-in infrared library', () => {
  const library = new IrLibrary();

  it('lists air conditioners and televisions with their brands', () => {
    const categories = library.categories();
    expect(categories.map((one) => one.name)).toEqual(
      expect.arrayContaining(['Air conditioner', 'TV', 'Fan', 'Projector']),
    );
    expect(library.brands('TV').map((one) => one.name)).toContain('Samsung');
    expect(library.brands('Air conditioner').length).toBeGreaterThan(50);
  });

  it('draws air conditioners from both open sources', () => {
    const air = library
      .brands('Air conditioner')
      .flatMap((brand) => library.entries('Air conditioner', brand.name));
    expect(new Set(air.map((entry) => entry.source))).toStrictEqual(
      new Set(['smartir', 'flipper-irdb']),
    );
  });

  it('decodes every model to valid pulse codes', () => {
    const climate = { models: 0, codes: 0 };
    const keys = { models: 0, codes: 0 };
    for (const category of library.categories()) {
      for (const brand of library.brands(category.name)) {
        for (const entry of library.entries(category.name, brand.name)) {
          const model = library.model(entry.id);
          const codes =
            model.kind === 'keys'
              ? Object.values(model.keys)
              : [
                  model.off,
                  ...Object.values(model.commands).flatMap((mode) =>
                    Object.values(mode).flatMap((fan) =>
                      typeof fan === 'string' ? [fan] : Object.values(fan),
                    ),
                  ),
                ];
          codes.forEach((code) => {
            expect(pulsesFromBase64(code).length).toBeGreaterThan(1);
          });
          const tally = model.kind === 'keys' ? keys : climate;
          tally.models += 1;
          tally.codes += codes.length;
        }
      }
    }
    expect(climate.models).toBeGreaterThan(200);
    expect(keys.models).toBeGreaterThan(1500);
  });

  it('refuses an id it does not have', () => {
    expect(() => library.model('smartir:climate:nope')).toThrow(IrLibraryEntryUnknownError);
  });
});
