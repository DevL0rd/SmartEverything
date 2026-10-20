import {
  CAPABILITY_KEY,
  CommandRefusedError,
  type BrushActionResult,
  type BrushStep,
  type CommandSource,
  type DeviceCommand,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actBrush } from '../../../src/local/toothbrush/acts';
import { runBrushCommand, type CommandDeps } from '../../../src/local/toothbrush/commands';
import { testLogger } from '../../support/logs';
import {
  NO_PHONE,
  identityOf,
  sonicareRig,
  type Person,
  type SonicareRig,
} from '../../support/sonicare-rig';

interface Sent {
  readonly clientId: string;
  readonly steps: readonly BrushStep[];
}

let rig: SonicareRig;
let sent: Sent[];
let answer: BrushActionResult;
let holder: string | null;

const PRESTIGE = identityOf({ model: 'HX999X', bonded: true, routineIds: [0] });

async function open(identity = PRESTIGE): Promise<void> {
  rig = await sonicareRig(identity);
  sent = [];
  answer = { ok: true, detail: 'Done.' };
  holder = rig.owner.client.id;
  rig.batch(0, [rig.frame('4010', '01', 0), rig.frame('4420', '00020000', 0)]);
}

afterEach(async () => {
  await rig.close();
});

beforeEach(async () => {
  await open();
});

function depsOf(): CommandDeps {
  return {
    store: rig.test.store,
    fleet: rig.fleet,
    broker: {
      run: (target, steps): Promise<BrushActionResult> => {
        sent.push({ clientId: target.clientId, steps });
        return Promise.resolve(answer);
      },
    },
    holderOf: (): string | null => holder,
    now: rig.clock.now,
    log: testLogger('sonicare'),
  };
}

function run(
  capability: string,
  value: DeviceCommand['value'],
  by: { readonly source: CommandSource; readonly client: Person | null },
): Promise<unknown> {
  const device = rig.row();
  const [row] = rig.test.store.commands.insert([
    {
      deviceId: device.id,
      capability,
      value,
      source: by.source,
      requestedBy: by.client?.client.id ?? null,
    },
  ]);
  if (row === undefined) {
    throw new Error('the command was not stored');
  }
  return runBrushCommand(depsOf(), {
    commandId: row.id,
    externalId: device.external_id,
    capability: CAPABILITY_KEY.parse(row.capability),
    value,
  });
}

async function consent(): Promise<void> {
  await actBrush(
    {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: () => Promise.resolve() },
      bridges: { takeOver: () => Promise.reject(new Error('unused')) },
      ...NO_PHONE,
      now: rig.clock.now,
      log: testLogger('sonicare'),
    },
    rig.row(),
    {
      clientId: rig.owner.client.id,
      role: 'owner',
      profileId: rig.owner.profile.id,
      client: rig.owner.client,
      phone: true,
    },
    { action: 'configure', settings: { consent: true } },
  );
}

const OWNER = (): { source: CommandSource; client: Person } => ({
  source: 'app',
  client: rig.owner,
});

describe('changing the mode and intensity of a handle that accepts it', () => {
  it('is refused until the owner has allowed changes', async () => {
    await expect(run('brush_mode', 'gum_health', OWNER())).rejects.toThrow(CommandRefusedError);
    expect(sent).toHaveLength(0);
  });

  it('writes the routine id and reads it back through the holder phone', async () => {
    await consent();
    await run('brush_mode', 'gum_health', OWNER());
    expect(sent).toHaveLength(1);
    expect(sent[0]?.clientId).toBe(rig.owner.client.id);
    expect(sent[0]?.steps).toMatchObject([{ kind: 'write', hex: '02' }, { kind: 'read' }]);
    await run('brush_intensity', 'high', OWNER());
    expect(sent[1]?.steps[0]).toMatchObject({ kind: 'write', hex: '02' });
  });

  it('keeps the bits it does not touch when it changes one feedback switch', async () => {
    await consent();
    await run('brush_feedback_scrubbing', true, OWNER());
    expect(sent[0]?.steps[0]).toMatchObject({ kind: 'write', hex: '000a0000' });
    await run('brush_feedback_pressure', false, OWNER());
    expect(sent[1]?.steps[0]).toMatchObject({ hex: '00000000' });
  });

  it('lets only the owner change feedback switches', async () => {
    await consent();
    await expect(
      run('brush_feedback_pressure', true, { source: 'app', client: rig.member }),
    ).rejects.toThrow(/only the owner/);
    await expect(
      run('brush_mode', 'clean', { source: 'app', client: rig.member }),
    ).resolves.toBeDefined();
  });

  it('takes any mode on a handle that writes but refuses a brush in use and a sleeping brush', async () => {
    await consent();
    await expect(run('brush_mode', 'sensitive', OWNER())).resolves.toBeDefined();
    rig.batch(1, [
      rig.frame('4010', '02', 1),
      rig.frame('4082', '01', 1),
      rig.frame('4090', '0100', 1),
    ]);
    await expect(run('brush_mode', 'clean', OWNER())).rejects.toThrow(/in use/);
    rig.batch(2, [], 'asleep');
    await expect(run('brush_mode', 'clean', OWNER())).rejects.toThrow(/asleep/);
  });

  it('says so when no phone holds the link or the phone cannot be reached', async () => {
    await consent();
    holder = null;
    await expect(run('brush_mode', 'clean', OWNER())).rejects.toThrow(/not linked to a phone/);
    holder = rig.owner.client.id;
    answer = { ok: false, detail: 'The phone did not answer.' };
    await expect(run('brush_mode', 'clean', OWNER())).rejects.toThrow(/did not answer/);
  });

  it('refuses a value of the wrong kind and a capability it does not own', async () => {
    await consent();
    await expect(run('brush_intensity', 'turbo', OWNER())).rejects.toThrow(CommandRefusedError);
    await expect(run('brush_feedback_pressure', 'yes', OWNER())).rejects.toThrow(/on or off/);
    await expect(run('brush_head', 'fitted', OWNER())).rejects.toThrow(/cannot change/);
  });
});

describe('a handle that ignores writes', () => {
  it('explains that it is changed on the handle itself', async () => {
    await rig.close();
    await open(identityOf());
    await expect(run('brush_mode', 'clean', OWNER())).rejects.toThrow(/on the handle itself/);
  });
});
