import {
  CAPABILITY_KEY,
  CommandRefusedError,
  type BrushStep,
  type DeviceCommand,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { actBrush, type Actor } from '../../../src/local/toothbrush/acts';
import { oralbCapabilities } from '../../../src/local/oralb/capabilities';
import { oralbSettingsOf } from '../../../src/local/oralb/config';
import { bytes, long, oralbRig, type OralbRig } from './rig';

let rig: OralbRig | undefined;

afterEach(async () => {
  await rig?.close();
  rig = undefined;
});

const PASSED = { passedAt: '2026-10-18T09:00:00.000Z', firmware: 82, rule: 'prefixed' } as const;

async function open(
  oralb: Readonly<Record<string, unknown>> = {},
  consent = true,
): Promise<OralbRig> {
  rig = await oralbRig({ settings: { consent }, oralb });
  return rig;
}

function wake(brushed: OralbRig, seconds = 0): void {
  brushed.batch(seconds, {
    phase: 'linked',
    frames: [
      brushed.frame('ff04', bytes(2, 0), seconds),
      brushed.frame('ff26', '1e1e1e1e00000000', seconds),
      brushed.frame('ff25', '0b00010302040607', seconds),
      brushed.frame('ff2b', '44cf6300', seconds),
      brushed.frame('ff2d', bytes(0, 30, 0, 88, 2), seconds),
      brushed.frame('ff22', long(838_854_030), seconds),
    ],
  });
}

function command(capability: string, value: DeviceCommand['value']): DeviceCommand {
  return {
    commandId: 'c1',
    externalId: rig?.device.external_id ?? '',
    capability: CAPABILITY_KEY.parse(capability),
    value,
  };
}

function owner(current: OralbRig): Actor {
  return {
    clientId: current.owner.client.id,
    role: 'owner',
    profileId: current.owner.profile.id,
    client: current.owner.client,
    phone: true,
  };
}

function member(current: OralbRig): Actor {
  return {
    clientId: current.member.client.id,
    role: 'member',
    profileId: current.member.profile.id,
    client: current.member.client,
    phone: true,
  };
}

function stepsFor(current: OralbRig, value: DeviceCommand, isOwner = true): BrushStep[] {
  const state = current.fleet.of(current.row());
  return state.runtime.brand.command(value, { state, owner: () => isOwner });
}

describe('changing the brush before a handle test passed', () => {
  it('refuses with the reason that names the handle test', async () => {
    const brushed = await open();
    wake(brushed);
    expect(() => stepsFor(brushed, command('brush_pacer', false))).toThrow(CommandRefusedError);
    expect(() => stepsFor(brushed, command('brush_pacer', false))).toThrow('Handle tests');
    const state = brushed.fleet.of(brushed.row());
    const writes = state.runtime.definition.writes(state);
    expect(writes.allowed).toBe(false);
    expect(writes.reason).toContain('handle test');
  });

  it('offers the write only to the owner, with consent, on a linked idle brush', async () => {
    const brushed = await open({ probes: { pacer_write: PASSED } }, false);
    expect(() => stepsFor(brushed, command('brush_pacer', false))).toThrow('has not allowed');
    const state = brushed.fleet.of(brushed.row());
    expect(state.runtime.definition.writes(state).reason).toContain('has not allowed');
  });

  it('refuses while the brush is asleep and while it is in use', async () => {
    const brushed = await open({ probes: { pacer_write: PASSED } });
    expect(() => stepsFor(brushed, command('brush_pacer', false))).toThrow('asleep');
    wake(brushed);
    brushed.batch(1, { phase: 'linked', frames: [brushed.frame('ff04', bytes(3, 0), 1)] });
    expect(() => stepsFor(brushed, command('brush_pacer', false))).toThrow('in use');
  });

  it('refuses a member and a value the brush cannot take', async () => {
    const brushed = await open({ probes: { pacer_write: PASSED, ring_write: PASSED } });
    wake(brushed);
    expect(() => stepsFor(brushed, command('brush_pacer', false), false)).toThrow('only the owner');
    expect(() => stepsFor(brushed, command('brush_quadrant_seconds', 3))).toThrow('cannot change');
    expect(() => stepsFor(brushed, command('brush_ring_colour', 'custom'))).toThrow(
      'cannot change',
    );
    expect(() => stepsFor(brushed, command('brush_mode', 'whiten'))).toThrow('cannot change');
  });
});

describe('changing the brush after the handle test passed', () => {
  it('writes the prefix and the pacer, then reads it back', async () => {
    const brushed = await open({ probes: { pacer_write: PASSED } });
    wake(brushed);
    const steps = stepsFor(brushed, command('brush_quadrant_seconds', 45));
    expect(steps.map((step) => (step.kind === 'write' ? step.hex : 'read'))).toEqual([
      '372a',
      '2d2d2d2d00000000',
      'read',
    ]);
    const off = stepsFor(brushed, command('brush_pacer', false));
    expect(off.map((step) => (step.kind === 'write' ? step.hex : 'read'))).toEqual([
      '372a',
      '0000000000000000',
      'read',
    ]);
  });

  it('uses the plain command byte when that is the rule that passed', async () => {
    const brushed = await open({
      probes: { ring_write: { ...PASSED, rule: 'plain' } },
    });
    wake(brushed);
    const steps = stepsFor(brushed, command('brush_ring_colour', 'pink'));
    expect(steps.map((step) => (step.kind === 'write' ? step.hex : 'read'))).toEqual([
      '2f',
      'b2091a00',
      'read',
    ]);
  });

  it('turns the pacer back on with the schedule it had', async () => {
    const brushed = await open({ probes: { pacer_write: PASSED } });
    wake(brushed);
    brushed.batch(2, { phase: 'linked', frames: [brushed.frame('ff26', '0000000000000000', 2)] });
    const steps = stepsFor(brushed, command('brush_pacer', true));
    expect(steps.map((step) => (step.kind === 'write' ? step.hex : 'read'))[1]).toBe(
      '1e1e1e1e00000000',
    );
  });

  it('stops counting a pass after a firmware update', async () => {
    const brushed = await open({ probes: { pacer_write: PASSED } });
    wake(brushed);
    const before = oralbCapabilities(
      brushed.test.store.localDevices.byExternalId(brushed.device.external_id),
    );
    expect(before.find((capability) => capability.key === 'brush_pacer')?.access).toBe(
      'read_write',
    );
    brushed.batch(3, { adverts: [brushed.advert(3, { state: 2, firmware: 90 })] });
    const entry = brushed.test.store.localDevices.byExternalId(brushed.device.external_id);
    expect(
      oralbCapabilities(entry).find((capability) => capability.key === 'brush_pacer')?.access,
    ).toBe('read');
    expect(() => stepsFor(brushed, command('brush_pacer', false))).toThrow('Handle tests');
  });
});

describe('the handle tests', () => {
  it('records the first prefix rule the brush keeps and unlocks only that control', async () => {
    const brushed = await open();
    wake(brushed);
    brushed.answers.push(
      { ok: false, detail: 'The brush refused the write.' },
      { ok: true, detail: 'ok' },
    );
    const result = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'pacer_write',
    });
    expect(result.ok).toBe(true);
    expect(brushed.sent).toHaveLength(2);
    expect(brushed.sent[0]?.[0]).toMatchObject({ hex: '372a' });
    expect(brushed.sent[1]?.[0]).toMatchObject({ hex: '2a' });
    const block = oralbSettingsOf(
      brushed.test.store.localDevices.byExternalId(brushed.device.external_id),
    );
    expect(block.probes.pacer_write).toMatchObject({ firmware: 82, rule: 'plain' });
    expect(block.probes.ring_write).toBeUndefined();
    expect(brushed.observed.length).toBeGreaterThan(0);
  });

  it('records a failure with the reason when neither rule is kept', async () => {
    const brushed = await open();
    wake(brushed);
    brushed.answers.push(
      { ok: false, detail: 'first no' },
      { ok: false, detail: 'The brush did not keep the change.' },
    );
    const result = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'mode_order_write',
    });
    expect(result).toEqual({ ok: false, detail: 'The brush did not keep the change.' });
    const block = oralbSettingsOf(
      brushed.test.store.localDevices.byExternalId(brushed.device.external_id),
    );
    expect(block.probes.mode_order_write).toMatchObject({
      reason: 'The brush did not keep the change.',
      firmware: 82,
    });
  });

  it('writes the ring colour back, then a different one, then the first again', async () => {
    const brushed = await open();
    wake(brushed);
    const result = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'ring_write',
    });
    expect(result.ok).toBe(true);
    expect(
      brushed.sent.map((steps) => steps.map((step) => (step.kind === 'write' ? step.hex : 'read'))),
    ).toEqual([
      ['372f', '44cf6300', 'read'],
      ['372f', '80ff0000', 'read'],
      ['372f', '44cf6300', 'read'],
    ]);
  });

  it('needs what the probe writes to have been reported and a linked brush', async () => {
    const asleep = await open();
    await expect(
      actBrush(asleep.acts(), asleep.row(), owner(asleep), {
        action: 'probe',
        probe: 'pacer_write',
      }),
    ).rejects.toThrow('asleep');
    await asleep.close();
    rig = await oralbRig({ settings: { consent: true } });
    rig.batch(0, { phase: 'linked', frames: [rig.frame('ff04', bytes(2, 0), 0)] });
    await expect(
      actBrush(rig.acts(), rig.row(), owner(rig), { action: 'probe', probe: 'pacer_write' }),
    ).rejects.toThrow('has not reported its pacer');
  });

  it('is for the owner only', async () => {
    const brushed = await open();
    wake(brushed);
    await expect(
      actBrush(brushed.acts(), brushed.row(), member(brushed), {
        action: 'probe',
        probe: 'pacer_write',
      }),
    ).rejects.toThrow('Only the owner');
    await expect(
      actBrush(brushed.acts(), brushed.row(), member(brushed), { action: 'reset_head_reminder' }),
    ).rejects.toThrow('Only the owner');
  });

  it('passes the advert test only after running adverts were heard with nobody connected', async () => {
    const brushed = await open();
    const failed = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'advert_log',
    });
    expect(failed.ok).toBe(false);
    expect(
      oralbSettingsOf(brushed.test.store.localDevices.byExternalId(brushed.device.external_id))
        .live,
    ).toBe('connected');
    for (let second = 1; second <= 4; second += 1) {
      brushed.batch(second, { adverts: [brushed.advert(second, { state: 3, timerS: second })] });
    }
    const passed = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'advert_log',
    });
    expect(passed.ok).toBe(true);
    expect(brushed.sent).toHaveLength(0);
  });

  it('asks the brush for the older session and for the metadata record', async () => {
    const brushed = await open();
    wake(brushed);
    await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'history_select',
    });
    await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'probe',
      probe: 'metadata_select',
    });
    expect(
      brushed.sent.map((steps) => steps.map((step) => (step.kind === 'write' ? step.hex : 'read'))),
    ).toEqual([
      ['0201', 'read'],
      ['05ff', 'read'],
    ]);
  });
});

describe('the handle actions', () => {
  it('reorders the modes and reads the order back', async () => {
    const brushed = await open({ probes: { mode_order_write: PASSED } });
    wake(brushed);
    const result = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'set_mode_order',
      modes: ['smart_adapt', 'daily_clean', 'whiten'],
    });
    expect(result.ok).toBe(true);
    expect(brushed.sent[0]?.map((step) => (step.kind === 'write' ? step.hex : 'read'))).toEqual([
      '3729',
      '0b0003ffffffffff',
      'read',
    ]);
    await expect(
      actBrush(brushed.acts(), brushed.row(), owner(brushed), {
        action: 'set_mode_order',
        modes: ['whiten', 'whiten'],
      }),
    ).rejects.toThrow('once');
  });

  it('resets and snoozes the head reminder, then reads it without comparing', async () => {
    const brushed = await open({ probes: { head_reset_write: { ...PASSED, rule: 'plain' } } });
    wake(brushed);
    await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'reset_head_reminder',
    });
    await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'snooze_head_reminder',
    });
    expect(
      brushed.sent.map((steps) => steps.map((step) => (step.kind === 'write' ? step.hex : 'read'))),
    ).toEqual([['0100000000'], ['read'], ['0200000000'], ['read']]);
  });

  it('refuses every handle action before its test passed', async () => {
    const brushed = await open();
    wake(brushed);
    await expect(
      actBrush(brushed.acts(), brushed.row(), owner(brushed), { action: 'reset_head_reminder' }),
    ).rejects.toThrow('Handle tests');
    expect(brushed.sent).toHaveLength(0);
  });

  it('reports a phone that cannot be reached instead of writing', async () => {
    const brushed = await open({ probes: { head_reset_write: PASSED } });
    wake(brushed);
    brushed.answers.push({
      ok: false,
      detail: 'The phone holding Toothbrush could not be reached.',
    });
    const result = await actBrush(brushed.acts(), brushed.row(), owner(brushed), {
      action: 'snooze_head_reminder',
    });
    expect(result.ok).toBe(false);
    expect(brushed.sent).toHaveLength(1);
  });
});
