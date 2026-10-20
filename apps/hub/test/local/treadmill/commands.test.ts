import { bytesToHex } from '@smarteverything/ble';
import {
  CAPABILITY_KEY,
  CommandRefusedError,
  type CommandSource,
  type DeviceCommand,
  type TreadmillActionResult,
  type TreadmillWriteStep,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actTreadmill } from '../../../src/local/treadmill/acts';
import { runTreadmillCommand, type CommandDeps } from '../../../src/local/treadmill/commands';
import { NoStepsGuard } from '../../../src/local/treadmill/guard';
import { TreadmillHealth } from '../../../src/local/treadmill/health';
import { captureLogs } from '../../support/logs';
import { testLogger } from '../../support/logs';
import {
  COUNTDOWN,
  IDLE,
  RUNNING,
  statusHex,
  treadmillRig,
  type Person,
  type TreadmillRig,
} from '../../support/treadmill-rig';

interface Sent {
  readonly clientId: string;
  readonly steps: readonly TreadmillWriteStep[];
}

let rig: TreadmillRig;
let sent: Sent[];
let answer: TreadmillActionResult;
let guard: NoStepsGuard;
let deps: CommandDeps;
let walker: string;

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig();
  sent = [];
  walker = rig.owner.profile.id;
  answer = { ok: true, detail: 'Done.' };
  guard = new NoStepsGuard();
  deps = {
    store: rig.test.store,
    fleet: rig.fleet,
    broker: {
      run: (target, steps): Promise<TreadmillActionResult> => {
        sent.push({ clientId: target.clientId, steps });
        return Promise.resolve(answer);
      },
    },
    guard,
    holderOf: (): string | null => rig.holder.clientId,
    walkerOf: (): string => walker,
    holderName: (): string => 'Owner phone',
    now: rig.clock.now,
    log: testLogger('treadmill'),
  };
  rig.batch(0, [statusHex({ state: IDLE })]);
});

afterEach(async () => {
  await rig.close();
});

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
  return runTreadmillCommand(deps, {
    commandId: row.id,
    externalId: device.external_id,
    capability: CAPABILITY_KEY.parse(row.capability),
    value,
  });
}

async function setPolicy(policy: Record<string, unknown>): Promise<void> {
  await actTreadmill(
    {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: () => Promise.resolve() },
      bridges: { takeOver: () => Promise.reject(new Error('unused')) },
      health: new TreadmillHealth(rig.test.store),
      broker: deps.broker,
      holderOf: deps.holderOf,
      now: rig.clock.now,
      log: testLogger('treadmill'),
    },
    rig.row(),
    {
      clientId: rig.owner.client.id,
      role: 'owner',
      profileId: rig.owner.profile.id,
      client: rig.owner.client,
      phone: true,
    },
    { action: 'configure', settings: { policy } },
  );
}

function walking(speed10 = 30): void {
  rig.batch(1, [statusHex({ state: COUNTDOWN })]);
  rig.batch(2, [statusHex({ state: RUNNING, speed10, time: 1, steps: 0 })]);
}

const ON_PHONE = { source: 'app', client: null } as const;

describe('starting the belt', () => {
  it('lets the person on the phone that holds the link start it, with the pad’s own pacing', async () => {
    await run('belt_command', 'start', { source: 'app', client: rig.owner });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.clientId).toBe(rig.owner.client.id);
    expect(sent[0]?.steps.map((step) => step.hex)).toEqual(['f7a20201a5fd', 'f7a20401a7fd']);
    expect(sent[0]?.steps[0]?.pauseAfterMs).toBe(1500);
  });

  it('refuses a start from the AI while remote start is off, naming the fix', async () => {
    await expect(
      run('belt_command', 'start', { source: 'assistant', client: rig.owner }),
    ).rejects.toThrow('holds the link');
    expect(sent).toHaveLength(0);
  });

  it('refuses a start from another phone while remote start is off', async () => {
    await expect(
      run('belt_command', 'start', { source: 'app', client: rig.member }),
    ).rejects.toThrow(CommandRefusedError);
  });

  it('lets the owner start remotely once the owner allowed it and watches for steps', async () => {
    await setPolicy({ remoteStart: true });
    await run('belt_command', 'start', { source: 'assistant', client: rig.owner });
    expect(sent).toHaveLength(1);
    rig.batch(3, [statusHex({ state: RUNNING, speed10: 8, time: 1, steps: 0 })]);
    rig.clock.advanceTo('2026-10-18T10:01:00.000Z');
    expect(guard.expired(rig.fleet.of(rig.row()), rig.clock.now().getTime())).toBe(true);
  });

  it('does not stop a remote start that has steps', async () => {
    await setPolicy({ remoteStart: true });
    await run('belt_command', 'start', { source: 'assistant', client: rig.owner });
    rig.batch(3, [statusHex({ state: RUNNING, speed10: 8, time: 1, steps: 5 })]);
    rig.clock.advanceTo('2026-10-18T10:01:00.000Z');
    expect(guard.expired(rig.fleet.of(rig.row()), rig.clock.now().getTime())).toBe(false);
  });

  it('keeps a member from starting remotely unless the owner chose to include the walker', async () => {
    await setPolicy({ remoteStart: true });
    await expect(
      run('belt_command', 'start', { source: 'assistant', client: rig.member }),
    ).rejects.toThrow('owner only');
    await setPolicy({ remoteWho: 'owner_and_walker' });
    rig.holder.clientId = rig.member.client.id;
    walker = rig.member.profile.id;
    await run('belt_command', 'start', { source: 'assistant', client: rig.member });
    expect(sent).toHaveLength(1);
  });

  it('lets automations and scenes start it like the owner once remote start is on', async () => {
    await setPolicy({ remoteStart: true });
    await run('belt_command', 'start', { source: 'automation', client: null });
    await run('belt_command', 'resume', { source: 'scene', client: null });
    expect(sent).toHaveLength(2);
  });
});

describe('who a command is from', () => {
  it('does not let a member pass as the owner by naming the automation or scene as the source', async () => {
    await setPolicy({ remoteStart: true });
    await expect(
      run('belt_command', 'start', { source: 'automation', client: rig.member }),
    ).rejects.toThrow('owner only');
    await expect(run('belt_max_speed', 7, { source: 'scene', client: rig.member })).rejects.toThrow(
      'only the owner',
    );
    await expect(
      run('child_lock', true, { source: 'automation', client: rig.member }),
    ).rejects.toThrow('only the owner');
    expect(sent).toHaveLength(0);
  });
});

describe('stopping and pausing', () => {
  it('always allows a stop or a pause, from anyone anywhere', async () => {
    await run('belt_command', 'stop', { source: 'assistant', client: rig.member });
    await run('belt_command', 'pause', { source: 'assistant', client: rig.member });
    expect(sent.map((call) => call.steps.map((step) => step.hex))).toEqual([
      ['f7a20100a3fd'],
      ['f7a20501a8fd'],
    ]);
  });
});

describe('several stop taps', () => {
  it('become one belt command while the first is on its way, then a later stop is sent again', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    deps = {
      ...deps,
      broker: {
        run: async (target, steps): Promise<TreadmillActionResult> => {
          sent.push({ clientId: target.clientId, steps });
          await gate;
          return answer;
        },
      },
    };
    const taps = [1, 2, 3].map(() =>
      run('belt_command', 'stop', { source: 'app', client: rig.owner }),
    );
    release();
    await Promise.all(taps);
    expect(sent).toHaveLength(1);
    await run('belt_command', 'stop', { source: 'app', client: rig.owner });
    expect(sent).toHaveLength(2);
  });
});

describe('speed', () => {
  it('refuses a speed while the belt is not moving', async () => {
    await expect(run('belt_speed', 4, { source: 'app', client: rig.owner })).rejects.toThrow(
      'start it first',
    );
  });

  it('sets a speed on a moving belt and slows down from anywhere', async () => {
    walking(80);
    await run('belt_speed', 4.5, { source: 'app', client: rig.owner });
    await run('belt_speed', 3, { source: 'assistant', client: rig.member });
    expect(sent.map((call) => call.steps[0]?.hex)).toEqual(['f7a2012dd0fd', 'f7a2011ec1fd']);
  });

  it('caps a remote speed-up and the pad’s own limit', async () => {
    walking();
    await setPolicy({ remoteStart: true, remoteMaxKmh: 5 });
    await expect(run('belt_speed', 7, { source: 'assistant', client: rig.owner })).rejects.toThrow(
      'capped at 5 km/h',
    );
    await run('belt_speed', 5, { source: 'assistant', client: rig.owner });
    rig.batch(5, ['f8a60000000000000000003c0500000000000000a9fd'.slice(0, 0) + prefsWithMax(60)]);
    await expect(run('belt_speed', 7, { source: 'app', client: rig.owner })).rejects.toThrow(
      'limited to 6 km/h',
    );
  });

  it('waits for the countdown to finish before it sets a speed', async () => {
    rig.batch(1, [statusHex({ state: COUNTDOWN })]);
    const pending = run('belt_speed', 4, { source: 'app', client: rig.owner });
    rig.batch(2, [statusHex({ state: RUNNING, speed10: 8, time: 1 })]);
    await pending;
    expect(sent).toHaveLength(1);
  });
});

function prefsWithMax(max10: number): string {
  const body = new Array<number>(20).fill(0);
  body[0] = 0xf8;
  body[1] = 0xa6;
  body[7] = max10;
  body[18] = body.slice(1, 18).reduce((sum, byte) => sum + byte, 0) & 0xff;
  body[19] = 0xfd;
  return bytesToHex(Uint8Array.from(body));
}

describe('mode and the settings stored on the pad', () => {
  it('refuses a mode change while the belt moves', async () => {
    walking();
    await expect(run('belt_mode', 'auto', ON_PHONE)).rejects.toThrow('after stopping the belt');
  });

  it('changes the mode of a stopped belt', async () => {
    await run('belt_mode', 'auto', { source: 'app', client: rig.owner });
    expect(sent[0]?.steps[0]?.hex).toBe('f7a20200a4fd');
  });

  it('lets only the owner change a setting stored on the pad and reads the pad back', async () => {
    await expect(
      run('child_lock', true, { source: 'assistant', client: rig.member }),
    ).rejects.toThrow('only the owner');
    await run('child_lock', true, { source: 'assistant', client: rig.owner });
    expect(sent[0]?.steps.map((step) => step.hex)).toEqual([
      'f7a60900000001b0fd',
      'f7a60000000000a6fd',
    ]);
  });

  it('keeps the goal kind and value together', async () => {
    await run('belt_goal', 'distance', { source: 'app', client: rig.owner });
    expect(sent[0]?.steps[0]?.hex).toBe('f7a60101000000a8fd');
    await run('belt_goal_value', 3000, { source: 'app', client: rig.owner });
    expect(sent[1]?.steps[0]?.hex).toBe('f7a60101000bb86bfd');
  });
});

describe('when the link or the phone fails', () => {
  it('says plainly that no phone holds the link', async () => {
    rig.holder.clientId = null;
    await expect(run('belt_command', 'stop', ON_PHONE)).rejects.toThrow('not linked to a phone');
  });

  it('says so when the link is lost', async () => {
    rig.ingest.process(rig.row(), rig.owner.client, {
      frames: [],
      link: { phase: 'lost', rssi: null, reconnects: 1, detail: 'gatt 133' },
    });
    await expect(run('belt_command', 'stop', ON_PHONE)).rejects.toThrow('not linked to a phone');
  });

  it('carries the phone’s own explanation and remembers the error for diagnostics', async () => {
    answer = { ok: false, detail: 'Write refused: KS Fit holds the belt.' };
    await expect(run('belt_command', 'stop', ON_PHONE)).rejects.toThrow('KS Fit holds the belt');
    expect(rig.fleet.of(rig.row()).lastError).toBe('Write refused: KS Fit holds the belt.');
    answer = { ok: true, detail: 'Done.' };
    await run('belt_command', 'stop', ON_PHONE);
    expect(rig.fleet.of(rig.row()).lastError).toBeNull();
    expect(rig.fleet.of(rig.row()).latencyMs).not.toBeNull();
  });
});
