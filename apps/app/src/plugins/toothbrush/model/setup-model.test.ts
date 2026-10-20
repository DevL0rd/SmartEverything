import type { BrushGattDump } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { BrushCandidate } from '../../../../modules/health-connect';
import {
  STEPS,
  canAdd,
  canContinue,
  dumpModel,
  initialSetup,
  modelUnknown,
  needsBond,
  pickedCandidate,
  setupReducer,
  sortedCandidates,
  stepAnnouncement,
  type SetupEvent,
  type SetupState,
} from './setup-model';

const CLASSIC: BrushCandidate = {
  name: 'Philips Sonicare',
  address: 'AA:01',
  rssi: -60,
  brand: 'sonicare',
  stack: 'classic',
  advert: null,
};
const CONDOR: BrushCandidate = {
  name: 'Sonicare Condor',
  address: 'AA:02',
  rssi: -50,
  brand: 'sonicare',
  stack: 'condor',
  advert: null,
};

function dumpWith(model: string | null): BrushGattDump {
  const hex =
    model === null
      ? []
      : [
          {
            uuid: '00002a24-0000-1000-8000-00805f9b34fb',
            properties: ['read' as const],
            value: Buffer.from(model, 'ascii').toString('hex'),
          },
        ];
  return {
    name: 'Philips Sonicare',
    services: [{ uuid: '0000180a-0000-1000-8000-00805f9b34fb', characteristics: hex }],
  };
}

function run(events: readonly SetupEvent[], start = initialSetup(false)): SetupState {
  return events.reduce(setupReducer, start);
}

describe('walking through the setup', () => {
  it('cannot leave the first step before the Philips app is confirmed closed', () => {
    expect(run([{ type: 'next' }]).step).toBe('check');
    expect(run([{ type: 'closed', value: true }, { type: 'next' }]).step).toBe('allow');
  });

  it('starts at the allow step already granted when the permission is known', () => {
    expect(initialSetup(true).permission).toBe('granted');
  });

  it('needs the permission before looking for the brush', () => {
    const state = run([{ type: 'closed', value: true }, { type: 'next' }, { type: 'next' }]);
    expect(state.step).toBe('allow');
    expect(
      run([
        { type: 'permission', granted: true },
        { type: 'closed', value: true },
        { type: 'next' },
        { type: 'next' },
      ]).step,
    ).toBe('wake');
  });

  it('goes back one step at a time and stops at the first', () => {
    const state = run([
      { type: 'closed', value: true },
      { type: 'next' },
      { type: 'back' },
      { type: 'back' },
    ]);
    expect(state.step).toBe('check');
  });

  it('announces the step for a screen reader', () => {
    expect(stepAnnouncement('wake')).toBe(`Step 3 of ${String(STEPS.length)}: Wake`);
  });
});

describe('finding the brush', () => {
  it('keeps one row per address and lists the strongest signal first', () => {
    const state = run([
      { type: 'candidate', candidate: CLASSIC },
      { type: 'candidate', candidate: CONDOR },
      { type: 'candidate', candidate: { ...CLASSIC, rssi: -40 } },
    ]);
    expect(state.candidates).toHaveLength(2);
    expect(sortedCandidates(state.candidates).map((candidate) => candidate.address)).toEqual([
      'AA:01',
      'AA:02',
    ]);
  });

  it('forgets later choices when another brush is picked', () => {
    const state = run([
      { type: 'candidate', candidate: CONDOR },
      { type: 'pick', address: 'AA:02' },
      { type: 'associated', address: 'AA:02' },
      { type: 'bonded' },
      { type: 'pick', address: 'AA:02' },
    ]);
    expect(state).toMatchObject({ associated: null, bonded: false, dump: null });
    expect(pickedCandidate(state)?.name).toBe('Sonicare Condor');
  });

  it('asks for pairing only for the Condor stack', () => {
    const condor = run([
      { type: 'candidate', candidate: CONDOR },
      { type: 'pick', address: 'AA:02' },
    ]);
    const classic = run([
      { type: 'candidate', candidate: CLASSIC },
      { type: 'pick', address: 'AA:01' },
    ]);
    expect(needsBond(condor)).toBe(true);
    expect(needsBond(classic)).toBe(false);
  });
});

describe('what lets each step continue', () => {
  const base = initialSetup(true);

  it.each([
    ['check', { philipsClosed: true }, true],
    ['check', {}, false],
    ['allow', {}, true],
    ['wake', { picked: 'AA:01' }, true],
    ['wake', {}, false],
    ['choose', { associated: 'AA:01' }, true],
    ['choose', {}, false],
    ['verify', { dump: dumpWith('HX992X') }, true],
    ['verify', {}, false],
    ['details', {}, false],
  ] as const)('on %s with %j the answer is %s', (step, patch, expected) => {
    expect(canContinue({ ...base, step, ...patch })).toBe(expected);
  });

  it('holds the pair step for a Condor brush until it is bonded', () => {
    const condor = { ...base, step: 'pair' as const, candidates: [CONDOR], picked: 'AA:02' };
    expect(canContinue(condor)).toBe(false);
    expect(canContinue({ ...condor, bonded: true })).toBe(true);
  });
});

describe('the model the brush reports', () => {
  it('reads the model number from the device information service', () => {
    expect(dumpModel(dumpWith('HX992X'))).toBe('HX992X');
    expect(dumpModel(dumpWith('HX999X\u0000\u0000'))).toBe('HX999X');
    expect(dumpModel(dumpWith(null))).toBeNull();
  });

  it('asks for a model pick when the brush does not report one, or reports one we do not know', () => {
    expect(modelUnknown(dumpWith(null))).toBe(true);
    expect(modelUnknown(dumpWith('HX1234'))).toBe(true);
    expect(modelUnknown(dumpWith('HX992X'))).toBe(false);
    expect(modelUnknown(null)).toBe(false);
  });

  it('allows adding only with a picked model when the brush is unknown', () => {
    const unknown = run([{ type: 'dumped', dump: dumpWith(null), bonded: false }]);
    expect(canAdd(unknown)).toBe(false);
    expect(canAdd(setupReducer(unknown, { type: 'model', key: 'hx6600' }))).toBe(true);
    expect(canAdd(run([{ type: 'dumped', dump: dumpWith('HX992X'), bonded: false }]))).toBe(true);
    expect(canAdd(initialSetup(false))).toBe(false);
  });

  it('remembers a bond the read reported', () => {
    expect(run([{ type: 'dumped', dump: dumpWith('HX992X'), bonded: true }]).bonded).toBe(true);
  });
});
