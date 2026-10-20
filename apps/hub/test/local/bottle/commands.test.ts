import {
  CAPABILITY_KEY,
  CommandRefusedError,
  type CommandSource,
  type DeviceCommand,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryConfigOf } from '../../../src/local/bottle/config';
import { runBottleCommand } from '../../../src/local/bottle/commands';
import { captureLogs, testLogger } from '../../support/logs';
import { bottleRig, type BottleRig, type Person } from '../../support/bottle-rig';

let rig: BottleRig;

beforeEach(async () => {
  captureLogs();
  rig = await bottleRig();
});

afterEach(async () => {
  await rig.close();
});

function run(
  capability: string,
  value: DeviceCommand['value'],
  by: { readonly source: CommandSource; readonly client: Person | null } = {
    source: 'app',
    client: rig.owner,
  },
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
  return runBottleCommand(
    { store: rig.test.store, actions: rig.actions, log: testLogger('bottle') },
    {
      commandId: row.id,
      externalId: device.external_id,
      capability: CAPABILITY_KEY.parse(row.capability),
      value,
    },
  );
}

function desired(): ReturnType<typeof entryConfigOf>['desired'] {
  return entryConfigOf(rig.entry()).desired;
}

describe('changing the reminder and the quiet hours through the generic device controls', () => {
  it('keeps each change until the bottle wakes and merges several into one wish', async () => {
    await expect(run('reminder_interval', 45)).resolves.toBe(
      'Saved. It applies when the bottle next wakes.',
    );
    await run('reminder_from', '07:30');
    await run('hydration_reminder', 'interval_fixed');
    expect(desired().reminder).toStrictEqual({
      intervalMin: 45,
      from: '07:30',
      state: 'interval_fixed',
    });
    await run('quiet_hours', 'auto');
    expect(desired().quiet).toStrictEqual({ state: 'auto' });
  });

  it('turns a colour into the hex the cap is given', async () => {
    await run('reminder_colour', { hue: 0, saturation: 100, value: 100 });
    expect(desired().reminder).toStrictEqual({ colour: '#ff0000' });
  });

  it('refuses values the cap would not take, naming what it needs', async () => {
    await expect(run('reminder_interval', 44)).rejects.toThrow(CommandRefusedError);
    await expect(run('reminder_from', '25:00')).rejects.toThrow('a time such as 08:00');
    await expect(run('quiet_hours', 'maybe')).rejects.toThrow('off, on or auto');
    await expect(run('reminder_colour', 'red')).rejects.toThrow('a colour');
    await expect(run('battery', 50)).rejects.toThrow('cannot change this');
  });
});

describe('who may change the bottle', () => {
  it('lets the owner, the person it belongs to and an automation, and nobody else', async () => {
    await expect(
      run('reminder_interval', 30, { source: 'app', client: rig.member }),
    ).rejects.toThrow('only the owner and the person this bottle belongs to');
    await run('reminder_interval', 30, { source: 'automation', client: null });
    await rig.act(rig.owner, { action: 'bind_person', personId: rig.member.profile.id });
    await run('reminder_interval', 60, { source: 'app', client: rig.member });
    expect(desired().reminder).toStrictEqual({ intervalMin: 60 });
  });
});

describe('actions that need the cap awake', () => {
  async function answer(ok: boolean, detail: string): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const push = rig.pushes.at(-1);
    rig.broker.answer(push?.clientId ?? '', String(push?.payload['requestId']), { ok, detail });
  }

  it('stops a clean through the phone and reports the phone’s answer', async () => {
    const stopping = run('uv_clean', 'stop');
    await answer(true, 'Stopped.');
    await expect(stopping).resolves.toBe('Stopped.');
    expect(rig.pushes.at(-1)?.payload).toMatchObject({ action: 'uv_stop' });
  });

  it('syncs and measures through the phone, and fails with the phone’s reason', async () => {
    const syncing = run('bottle_sync', null);
    await answer(true, 'Synced.');
    await expect(syncing).resolves.toBe('Synced.');
    const measuring = run('measure_level', null);
    await answer(false, 'Put the bottle upright on a flat surface and try again.');
    await expect(measuring).rejects.toThrow('upright');
  });

  it('never starts a clean, whoever asks, because starting needs a person at the bottle', async () => {
    await expect(run('uv_clean', 'normal')).rejects.toThrow('holding the Clean button');
    await expect(
      run('uv_clean', 'adventure', { source: 'automation', client: null }),
    ).rejects.toThrow('holding the Clean button');
    expect(rig.pushes).toHaveLength(0);
  });

  it('says so when no phone can be asked', async () => {
    rig.test.store.clients.remove(rig.owner.client.id);
    await expect(run('bottle_sync', null, { source: 'automation', client: null })).rejects.toThrow(
      'No phone could be reached',
    );
  });
});
