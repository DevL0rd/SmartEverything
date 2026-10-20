import { afterEach, describe, expect, it } from 'vitest';
import { actBrush } from '../../../src/local/toothbrush/acts';
import { planOf } from '../../../src/local/sonicare/plan';
import { testLogger } from '../../support/logs';
import {
  NO_PHONE,
  identityOf,
  sonicareRig,
  word,
  type SonicareRig,
} from '../../support/sonicare-rig';

let rig: SonicareRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

async function configure(brushed: SonicareRig, settings: Record<string, unknown>): Promise<void> {
  await actBrush(
    {
      store: brushed.test.store,
      fleet: brushed.fleet,
      local: { observe: () => Promise.resolve() },
      bridges: { takeOver: () => Promise.reject(new Error('unused')) },
      ...NO_PHONE,
      now: brushed.clock.now,
      log: testLogger('sonicare'),
    },
    brushed.row(),
    {
      clientId: brushed.owner.client.id,
      role: 'owner',
      profileId: brushed.owner.profile.id,
      client: brushed.owner.client,
      phone: true,
    },
    { action: 'configure', settings },
  );
}

describe('the plan a phone follows', () => {
  it('asks for pressure and temperature by default and for nothing else when they are off', async () => {
    rig = await sonicareRig();
    const plan = planOf(rig.row(), rig.fleet.of(rig.row()), true, rig.clock.now());
    expect(plan.prepare).toMatchObject([{ kind: 'write', hex: '0300' }]);
    await configure(rig, { sensors: { pressure: false, temperature: false } });
    const quiet = planOf(rig.row(), rig.fleet.of(rig.row()), true, rig.clock.now());
    expect(quiet.prepare).toStrictEqual([]);
    expect(quiet.subscriptions.some((entry) => entry.characteristic.endsWith('4130'))).toBe(false);
  });

  it('adds the clock and the default mode only for a writable handle the owner allowed', async () => {
    rig = await sonicareRig(
      identityOf({ model: 'HX999X', bonded: true, routineIds: [0], clockIsUnix: false }),
    );
    const before = planOf(rig.row(), rig.fleet.of(rig.row()), true, rig.clock.now());
    expect(before.initial).toStrictEqual([]);
    await configure(rig, { consent: true, defaultMode: 'gum_health', defaultIntensity: 'high' });
    const plan = planOf(rig.row(), rig.fleet.of(rig.row()), true, rig.clock.now());
    expect(
      plan.initial.map((step) => (step.kind === 'write' ? step.hex : step.kind)),
    ).toStrictEqual([
      '5072f369'.replace(
        '5072f369',
        Buffer.from(new Uint32Array([Math.floor(Date.parse(rig.at(0)) / 1000)]).buffer).toString(
          'hex',
        ),
      ),
      '02',
      '02',
    ]);
  });

  it('leaves the writes out while the brush is in use', async () => {
    rig = await sonicareRig(identityOf({ model: 'HX999X', bonded: true, routineIds: [0] }));
    await configure(rig, { consent: true, defaultMode: 'clean' });
    rig.batch(1, [
      rig.frame('4010', '02', 1),
      rig.frame('4082', '01', 1),
      rig.frame('4090', word(5), 1),
    ]);
    expect(planOf(rig.row(), rig.fleet.of(rig.row()), true, rig.clock.now()).initial).toStrictEqual(
      [],
    );
  });

  it('plans frames for a Series 7100 and says it needs a bond', async () => {
    rig = await sonicareRig(
      identityOf({
        model: 'HX742X',
        stack: 'condor',
        bonded: true,
        serial: null,
        routineIds: null,
      }),
    );
    const plan = planOf(rig.row(), rig.fleet.of(rig.row()), false, rig.clock.now());
    expect(plan).toMatchObject({
      transport: 'condor',
      brand: 'sonicare',
      bonded: true,
      holder: false,
      subscriptions: [],
    });
    expect(plan.initial.every((step) => step.kind === 'condor_frame')).toBe(true);
  });

  it('cancels a transfer the handle may still hold after a dropped link', async () => {
    rig = await sonicareRig();
    rig.batch(0, [rig.frame('40d0', word(5), 0)]);
    rig.batch(1, [rig.frame('40e0', `${word(5)}0f000000aaaa`, 1)]);
    rig.batch(2, [], 'asleep');
    const plan = planOf(rig.row(), rig.fleet.of(rig.row()), true, rig.clock.now());
    expect(plan.initial).toMatchObject([{ kind: 'write', hex: '02' }]);
  });
});
