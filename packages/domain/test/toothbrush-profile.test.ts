import { describe, expect, it } from 'vitest';
import {
  SONICARE_IDENTITY,
  sonicareExternalId,
  brushFamilyOf,
  sonicareModelKey,
  headTypeOf,
  modesOfRoutines,
  sonicareProfileOf,
  type SonicareIdentity,
} from '../src';

function identity(values: Partial<SonicareIdentity>): SonicareIdentity {
  return SONICARE_IDENTITY.parse({
    model: 'HX992X',
    serial: '0143C5C968',
    firmware: '2.15.1 0.6.1.0',
    manufacturer: 'Philips OHC',
    pnp: null,
    stack: 'classic',
    bonded: false,
    address: '24:E5:AA:00:00:03',
    gapName: 'Philips Sonicare',
    services: [],
    ports: [],
    routineIds: [0, 1, 2, 4],
    clockIsUnix: true,
    ...values,
  });
}

describe('which family a model belongs to', () => {
  it.each([
    ['HX992X', 'classic_open'],
    ['HX993X', 'classic_open'],
    ['HX960X', 'classic_open'],
    ['HX999X', 'classic_bonded'],
    ['HX9996', 'classic_bonded'],
    ['HX962V', 'classic_bonded'],
    ['HX991M', 'classic_bonded'],
    ['HX6340   ', 'kids'],
    ['HX742X', 'condor_7100'],
    ['HX6600', 'condor_kids'],
    ['HX1234', 'unknown'],
    [null, 'unknown'],
  ] as const)('reads %s as %s', (model, family) => {
    expect(brushFamilyOf(model)).toBe(family);
  });
});

describe('what a handle can do', () => {
  it('lets only the Prestige handles accept writes', () => {
    const prestige = sonicareProfileOf(identity({ model: 'HX999X', bonded: true }));
    const open = sonicareProfileOf(identity({}));
    expect([prestige.writes, prestige.settingsWrite]).toStrictEqual([true, true]);
    expect([open.writes, open.settingsWrite]).toStrictEqual([false, false]);
  });

  it('shows pressure as a state only on the Series 7100 and not at all on Kids', () => {
    const condor = sonicareProfileOf(identity({ model: 'HX742X', stack: 'condor', bonded: true }));
    const kids = sonicareProfileOf(identity({ model: 'HX6340' }));
    expect(condor.pressure).toBe('state');
    expect(condor.history).toBe('observed_only');
    expect(kids.pressure).toBe('none');
    expect(kids.zones).toBe(4);
    expect(kids.head).toBe('none');
  });

  it('marks bonded handles as bonded even when the phone read no bond yet', () => {
    expect(sonicareProfileOf(identity({ model: 'HX962V' })).bonded).toBe(true);
    expect(sonicareProfileOf(identity({ model: 'HX992X' })).bonded).toBe(false);
  });

  it('detects what an unknown handle offers from its services and ports', () => {
    const classic = sonicareProfileOf(
      identity({
        model: 'HX1234',
        services: [
          '477ea600-a260-11e4-ae37-0002a5d50005',
          '477ea600-a260-11e4-ae37-0002a5d50006',
          '477ea600-a260-11e4-ae37-0002a5d50004',
        ],
      }),
    );
    const condor = sonicareProfileOf(
      identity({ model: null, stack: 'condor', ports: ['Battery', 'BrushHead'] }),
    );
    expect(classic).toMatchObject({
      family: 'unknown',
      pressure: 'value',
      head: 'usage',
      history: 'retained',
    });
    expect(condor).toMatchObject({ pressure: 'none', head: 'usage', history: 'observed_only' });
    expect([classic.writes, condor.writes]).toStrictEqual([false, false]);
  });
});

describe('names that identify a brush', () => {
  it('keys a handle by its serial and falls back to its address', () => {
    expect(sonicareExternalId(identity({}))).toBe('philips_sonicare:0143C5C968');
    expect(sonicareExternalId(identity({ serial: null }))).toBe(
      'philips_sonicare:24:E5:AA:00:00:03',
    );
  });

  it('folds the colour letter of the model into x', () => {
    expect(sonicareModelKey(identity({ model: 'HX992B' }))).toBe('philips.toothbrush.hx992x');
    expect(sonicareModelKey(identity({ model: null }))).toBe('philips.toothbrush.unknown');
  });

  it('turns routine ids into the modes the handle offers without repeats', () => {
    expect(modesOfRoutines([0, 1, 2, 4])).toStrictEqual([
      'clean',
      'white_plus',
      'gum_health',
      'deep_clean_plus',
    ]);
    expect(modesOfRoutines([0, 5, 1, 2, 0, 9])).toStrictEqual([
      'clean',
      'sensitive',
      'white_plus',
      'gum_health',
    ]);
  });

  it('names the head families the handle reports', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(headTypeOf)).toStrictEqual([
      'clean',
      'white',
      'gums',
      'tongue',
      'all_in_one',
      'sensitive',
      'other',
    ]);
  });
});
