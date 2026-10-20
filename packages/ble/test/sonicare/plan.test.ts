import {
  BRUSH_LINK_PLAN,
  BRUSH_STEP,
  sonicareProfileOf,
  type SonicareIdentity,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  NotASonicareError,
  type BrushDelta,
  brushIdentityOf,
  brushLinkPlanParts,
  cancelTransferStep,
  clockWriteStep,
  decodeClassic,
  fullOf,
  intensityWriteStep,
  modeOfId,
  modeWriteStep,
  resolveMode,
  routineIdOf,
  sensorMaskWriteStep,
  sequentialModes,
  sessionFetchSteps,
  settingsWriteStep,
  shortOf,
  classicServiceOf,
} from '../../src';
import { dumpOf, readValues } from './fixtures';

function identityOf(name: string, bonded = false, ports: readonly string[] = []): SonicareIdentity {
  return brushIdentityOf(dumpOf(name), { address: '24:E5:AA:00:00:01', bonded, ports });
}

describe('identifying a recorded handle', () => {
  it('reads the model, stack and routine list of the HX992X', () => {
    expect(identityOf('fx_classic_hx992x')).toMatchObject({
      model: 'HX992X',
      stack: 'classic',
      firmware: '2.15.1 0.6.1.0',
      routineIds: [0, 1, 2, 4],
      clockIsUnix: true,
      gapName: 'Philips Sonicare',
    });
  });

  it('notices a clock that was never set and a Condor service', () => {
    expect(identityOf('fx_classic_hx999x_prestige').clockIsUnix).toBe(false);
    expect(identityOf('fx_condor_hx742x', true, ['Battery'])).toMatchObject({
      model: 'HX742X',
      stack: 'condor',
      bonded: true,
      ports: ['Battery'],
      routineIds: null,
      clockIsUnix: null,
    });
  });

  it('refuses a device that is not a Sonicare', () => {
    expect(() =>
      brushIdentityOf(
        { name: 'Other', services: [{ uuid: '180f', characteristics: [] }] },
        { address: 'aa', bonded: false, ports: [] },
      ),
    ).toThrow(NotASonicareError);
  });
});

describe('addressing characteristics', () => {
  it('shortens and expands the two uuid families', () => {
    expect(shortOf('477ea600-a260-11e4-ae37-0002a5d54010')).toBe('4010');
    expect(shortOf('00002a19-0000-1000-8000-00805f9b34fb')).toBe('2a19');
    expect(shortOf('e50b0003-af04-4564-92ad-fef019489de6')).toBe(
      'e50b0003-af04-4564-92ad-fef019489de6',
    );
    expect(fullOf('4010')).toBe('477ea600-a260-11e4-ae37-0002a5d54010');
    expect(fullOf('2a19')).toBe('00002a19-0000-1000-8000-00805f9b34fb');
  });

  it('puts the storage characteristics of a Kids handle in the kids session service', () => {
    expect(classicServiceOf('40d0', false)).toBe('477ea600-a260-11e4-ae37-0002a5d50004');
    expect(classicServiceOf('40d0', true)).toBe('477ea600-a260-11e4-ae37-0002a5d50003');
    expect(classicServiceOf('4420', false)).toBe('477ea600-a260-11e4-ae37-0002a5d50008');
    expect(classicServiceOf('9999', false)).toBeNull();
  });

  it('finds every characteristic of the recorded handles in the service the plan names', () => {
    for (const name of ['fx_classic_hx992x', 'fx_classic_hx999x_prestige']) {
      const dump = dumpOf(name);
      const services = new Map(
        dump.services.flatMap((service) =>
          service.characteristics.map((c) => [shortOf(c.uuid), service.uuid] as const),
        ),
      );
      const profile = sonicareProfileOf(identityOf(name));
      const plan = brushLinkPlanParts(profile, 3, false);
      for (const place of [...plan.subscriptions, ...plan.reads]) {
        const found = services.get(shortOf(place.characteristic));
        if (found !== undefined) {
          expect(found).toBe(place.service);
        }
      }
    }
  });
});

describe('what a phone is told to do on a Classic handle', () => {
  const profile = sonicareProfileOf(identityOf('fx_classic_hx992x'));

  it('writes the sensor mask before it subscribes and subscribes to the sensor stream last', () => {
    const plan = brushLinkPlanParts(profile, 3, false);
    expect(plan.prepare).toHaveLength(1);
    expect(plan.prepare[0]).toMatchObject({ kind: 'write', hex: '0300' });
    expect(plan.subscriptions.at(-1)?.characteristic).toBe(fullOf('4130'));
    expect(plan.subscriptions.find((s) => s.characteristic === fullOf('4010'))?.mode).toBe(
      'indicate',
    );
    expect(plan.subscriptions.find((s) => s.characteristic === fullOf('4090'))?.mode).toBe(
      'notify',
    );
  });

  it('asks for nothing about sensors when none are wanted', () => {
    const plan = brushLinkPlanParts(profile, 0, false);
    expect(plan.prepare).toStrictEqual([]);
    expect(plan.subscriptions.some((s) => s.characteristic === fullOf('4130'))).toBe(false);
  });

  it('cancels a transfer the handle may still hold when asked to', () => {
    expect(brushLinkPlanParts(profile, 0, true).initial).toStrictEqual([
      expect.objectContaining({ hex: '02' }),
    ]);
    expect(brushLinkPlanParts(profile, 0, false).initial).toStrictEqual([]);
  });

  it('subscribes to every characteristic a stored session transfer arrives on', () => {
    const subscribed = brushLinkPlanParts(profile, 0, false).subscriptions.map((s) =>
      shortOf(s.characteristic),
    );
    expect(subscribed).toEqual(expect.arrayContaining(['40e0', '4100', '4110']));
    const kids = sonicareProfileOf(identityOf('fx_classic_hx6340_kids'));
    const kidsSubscribed = brushLinkPlanParts(kids, 0, false).subscriptions.map((s) =>
      shortOf(s.characteristic),
    );
    expect(kidsSubscribed).not.toContain('4100');
    expect(kidsSubscribed).not.toContain('4110');
  });

  it('leaves out the brush head for a handle without one', () => {
    const kids = sonicareProfileOf(identityOf('fx_classic_hx6340_kids'));
    const reads = brushLinkPlanParts(kids, 0, false).reads.map((read) =>
      shortOf(read.characteristic),
    );
    expect(reads).not.toContain('4230');
    expect(reads).toContain('4090');
  });

  it('produces plans and steps the contract accepts', () => {
    const plan = brushLinkPlanParts(profile, 3, true);
    expect(
      BRUSH_LINK_PLAN.parse({
        deviceId: '11111111-1111-4111-8111-111111111111',
        address: 'aa',
        transport: plan.transport,
        brand: plan.brand,
        bonded: false,
        adverts: plan.adverts,
        sync: plan.sync,
        prepare: plan.prepare,
        subscriptions: plan.subscriptions,
        reads: plan.reads,
        initial: plan.initial,
        policy: 'on_demand',
        holder: true,
      }).subscriptions.length,
    ).toBeGreaterThan(5);
    expect(BRUSH_STEP.parse(sessionFetchSteps(profile, 5)[0])).toMatchObject({ kind: 'write' });
  });
});

describe('what a phone is told to do on a Condor handle', () => {
  const profile = sonicareProfileOf(identityOf('fx_condor_hx742x', true));

  it('subscribes to the state ports, reads all of them, then switches the sensor stream on', () => {
    const plan = brushLinkPlanParts(profile, 3, false);
    expect(plan.subscriptions).toStrictEqual([]);
    expect(plan.initial.every((step) => step.kind === 'condor_frame')).toBe(true);
    expect(plan.initial).toHaveLength(7 + 8 + 2);
    const types = plan.initial.map((step) =>
      step.kind === 'condor_frame' ? step.hex.slice(4, 6) : '',
    );
    expect(types.slice(0, 7)).toStrictEqual(Array(7).fill('05'));
    expect(types.slice(7, 15)).toStrictEqual(Array(8).fill('04'));
    expect(types.slice(15)).toStrictEqual(['05', '03']);
  });

  it('skips the sensor stream when no sensor is wanted', () => {
    expect(brushLinkPlanParts(profile, 0, false).initial).toHaveLength(7 + 8);
  });
});

describe('fetching and writing', () => {
  const classic = sonicareProfileOf(identityOf('fx_classic_hx999x_prestige', true));
  const kids = sonicareProfileOf(identityOf('fx_classic_hx6340_kids'));

  it('selects the kind, the session and starts the transfer on a handle with storage', () => {
    const steps = sessionFetchSteps(classic, 335);
    expect(steps.map((step) => (step.kind === 'write' ? step.hex : step.kind))).toStrictEqual([
      '00',
      '4f01',
      '00',
    ]);
    expect(cancelTransferStep(classic)).toMatchObject({ hex: '02' });
  });

  it('selects the session and then reads the record on a Kids handle', () => {
    const steps = sessionFetchSteps(kids, 286);
    expect(steps).toHaveLength(2);
    expect(steps[1]).toMatchObject({ kind: 'read' });
    expect(steps[0]).toMatchObject({ service: '477ea600-a260-11e4-ae37-0002a5d50003' });
  });

  it('writes a mode, an intensity, the settings, the clock and the sensor mask', () => {
    expect(modeWriteStep(classic, routineIdOf('white_plus'))).toMatchObject({ hex: '01' });
    expect(intensityWriteStep(classic, 2)).toMatchObject({ hex: '02' });
    expect(settingsWriteStep(classic, 0x1a00)).toMatchObject({ hex: '001a0000' });
    expect(clockWriteStep(classic, 0x6a4fd034)).toMatchObject({ hex: '34d04f6a' });
    expect(sensorMaskWriteStep(classic, 7)).toMatchObject({ hex: '0700' });
  });
});

describe('naming the mode', () => {
  it('reads the position in the routine list of a handle that reports one', () => {
    const ids = [0, 1, 2, 4];
    const modes = [0, 1, 2, 3].map((position) =>
      resolveMode({
        selectsById: false,
        routineId: null,
        position,
        routineIds: ids,
        model: 'HX992X',
      }),
    );
    expect(modes).toStrictEqual(['clean', 'white_plus', 'gum_health', 'deep_clean_plus']);
  });

  it('reads the Series 7100 slot list where position 1 is sensitive', () => {
    const ids = [0, 5, 1, 2, 0];
    expect(
      resolveMode({
        selectsById: false,
        routineId: null,
        position: 1,
        routineIds: ids,
        model: 'HX742X',
      }),
    ).toBe('sensitive');
  });

  it('falls back to the per model order when the list was not read', () => {
    expect(sequentialModes('HX960X')).toStrictEqual(['clean', 'gum_health', 'deep_clean_plus']);
    expect(sequentialModes('HX991X')).toHaveLength(4);
    expect(sequentialModes(null)).toHaveLength(6);
    expect(
      resolveMode({
        selectsById: false,
        routineId: null,
        position: 1,
        routineIds: null,
        model: 'HX960X',
      }),
    ).toBe('gum_health');
  });

  it('refuses a position outside the list and a missing selection', () => {
    expect(
      resolveMode({
        selectsById: false,
        routineId: null,
        position: 9,
        routineIds: [0, 1],
        model: 'X',
      }),
    ).toBeNull();
    expect(
      resolveMode({
        selectsById: false,
        routineId: null,
        position: null,
        routineIds: [0],
        model: 'X',
      }),
    ).toBeNull();
    expect(
      resolveMode({
        selectsById: true,
        routineId: null,
        position: 0,
        routineIds: null,
        model: 'X',
      }),
    ).toBeNull();
    expect(modeOfId(9)).toBeNull();
  });

  it('turns the live values of a Prestige into the selected mode id', () => {
    const delta = readValues('fx_classic_hx999x_prestige').reduce<BrushDelta>(
      (all, value) => ({ ...all, ...decodeClassic(value.uuid, value.bytes) }),
      {},
    );
    expect(
      resolveMode({
        selectsById: true,
        routineId: delta.modeRoutineId ?? null,
        position: null,
        routineIds: null,
        model: 'HX999X',
      }),
    ).toBe('clean');
  });
});
