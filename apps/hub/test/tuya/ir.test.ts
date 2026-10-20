import { CommandRefusedError } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
import { MESSAGING_TOPICS } from './fake-cloud';
import { waitFor, world, type World } from './world';

let current: World | null = null;
let sequence = 0;

function commandId(): string {
  sequence += 1;
  return `8b1e1c7e-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
}

async function started(): Promise<World> {
  current = await world();
  return current;
}

async function blasterOnLan(w: World): Promise<void> {
  await w.announce('ir1', '127.0.0.3');
  await w.sink.until(
    () => w.sink.latest('ir1')?.details['transport'] === 'local',
    'the blaster to go local',
  );
  await waitFor(() => w.blaster.connections === 1, 'the blaster socket');
  await w.sink.until(
    () =>
      w.sink.events.some((event) => event.externalId === 'ir1' && event.kind === 'device_online'),
    'the blaster to come online',
  );
  await w.adapter.refresh(['ir1']);
}

afterEach(async () => {
  await current?.close();
  current = null;
});

describe('IR blaster on the LAN', () => {
  it('offers learning and sending and lists no library remotes', async () => {
    const w = await started();
    const devices = await w.adapter.discover();
    expect(
      devices
        .find((device) => device.externalId === 'ir1')
        ?.capabilities.map((capability) => capability.key),
    ).toStrictEqual(['temperature', 'humidity', 'ir_learn', 'ir_send']);
    expect(devices.some((device) => device.kind === 'ir_remote')).toBe(false);
  });

  it('learns a code locally and returns it as a pulse train', async () => {
    const w = await started();
    await blasterOnLan(w);
    const learning = w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_learn',
      value: null,
    });
    await waitFor(() => w.blaster.controls.length === 2, 'learning to start');
    w.blaster.push({ '2': '1KCOUETAC' });
    await expect(learning).resolves.toStrictEqual({ format: 'pulses', code: 'KCOUETAC' });
    await waitFor(() => w.blaster.controls.length === 3, 'learning to end');
    expect(w.blaster.controls.map((control) => control.dps)).toStrictEqual([
      { '1': 'study_exit' },
      { '1': 'study' },
      { '1': 'study_exit' },
    ]);
  });

  it('gives up learning after the timeout and ends learning on the blaster', async () => {
    const w = await started();
    await blasterOnLan(w);
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ir1',
        capability: 'ir_learn',
        value: null,
      }),
    ).rejects.toMatchObject({
      name: 'IrLearnTimeoutError',
      message: 'IR blaster ir1 reported no learned code within 2 seconds.',
    });
    await waitFor(() => w.blaster.controls.length === 3, 'learning to end');
  });

  it('sends a stored pulse train and a head and key pair locally', async () => {
    const w = await started();
    await blasterOnLan(w);
    await w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_send',
      value: { format: 'pulses', code: 'KCOUETAC' },
    });
    const head = '010ED80000000000030015004000 80'.replaceAll(' ', '');
    await w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_send',
      value: { format: 'head_key', code: JSON.stringify({ head, key: '01@#' }) },
    });
    await waitFor(() => w.blaster.controls.length === 2, 'both sends');
    expect(w.blaster.controls.map((control) => control.dps)).toStrictEqual([
      { '1': 'study_key', '7': 'KCOUETAC', '13': 0 },
      { '1': 'send_ir', '3': head, '4': '01@#', '13': 0 },
    ]);
    expect(w.h.cloud.commandsFor('ir1')).toStrictEqual([]);
  });

  it('refuses an IR send without a valid format and code', async () => {
    const w = await started();
    await blasterOnLan(w);
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ir1',
        capability: 'ir_send',
        value: { format: 'raw', code: 'x' },
      }),
    ).rejects.toThrow(
      new CommandRefusedError('ir_send', 'it needs a format of pulses or head_key and a code'),
    );
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ir1',
        capability: 'ir_send',
        value: { format: 'library', code: '{}' },
      }),
    ).rejects.toThrow(
      new CommandRefusedError('ir_send', 'it needs a format of pulses or head_key and a code'),
    );
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ir1',
        capability: 'ir_send',
        value: { format: 'pulses', code: 'KCOU' },
      }),
    ).rejects.toMatchObject({ name: 'IrCodeError' });
  });
});

describe('IR through the Smart Life cloud', () => {
  const HEAD = '010ED80000000000030015004000 80'.replaceAll(' ', '');

  async function ended(w: World, count: number): Promise<void> {
    await waitFor(() => w.h.cloud.commandsFor('ir1').length === count, 'the cloud commands');
  }

  it('learns a code through the cloud: study exit, study, the reported code, study exit', async () => {
    const w = await started();
    const learning = w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_learn',
      value: null,
    });
    await ended(w, 2);
    w.h.broker.publish(MESSAGING_TOPICS.device('ir1', 'pen'), {
      protocol: 4,
      data: { devId: 'ir1', status: [{ dpId: 2, value: '1KCOUETAC' }] },
    });
    await expect(learning).resolves.toStrictEqual({ format: 'pulses', code: 'KCOUETAC' });
    await ended(w, 3);
    expect(w.h.cloud.commandsFor('ir1')).toStrictEqual([
      { commands: [{ code: 'control', value: 'study_exit' }] },
      { commands: [{ code: 'control', value: 'study' }] },
      { commands: [{ code: 'control', value: 'study_exit' }] },
    ]);
  });

  it('gives up learning after the timeout and ends learning on the blaster', async () => {
    const w = await started();
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ir1',
        capability: 'ir_learn',
        value: null,
      }),
    ).rejects.toMatchObject({ name: 'IrLearnTimeoutError' });
    await ended(w, 3);
    expect(w.h.cloud.commandsFor('ir1').at(-1)).toStrictEqual({
      commands: [{ code: 'control', value: 'study_exit' }],
    });
  });

  it('sends a stored pulse train through the cloud as data point writes', async () => {
    const w = await started();
    await w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_send',
      value: { format: 'pulses', code: 'KCOUETAC' },
    });
    expect(w.h.cloud.commandsFor('ir1')).toStrictEqual([
      {
        commands: [
          { code: 'control', value: 'study_key' },
          { code: 'type', value: 0 },
          { code: 'key_study', value: 'KCOUETAC' },
        ],
      },
    ]);
  });

  it('sends a head and key pair through the cloud as data point writes', async () => {
    const w = await started();
    await w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_send',
      value: { format: 'head_key', code: JSON.stringify({ head: HEAD, key: '01@#' }) },
    });
    expect(w.h.cloud.commandsFor('ir1')).toStrictEqual([
      {
        commands: [
          { code: 'control', value: 'send_ir' },
          { code: 'type', value: 0 },
          { code: 'ir_code', value: HEAD },
          { code: 'key_code', value: '01@#' },
        ],
      },
    ]);
  });

  it('refuses to learn or send on a blaster whose data points are unknown, without any cloud call', async () => {
    const w = await started();
    const before = w.h.cloud.requests.length;
    for (const [capability, value] of [
      ['ir_send', { format: 'pulses', code: 'KCOUETAC' }],
      ['ir_learn', null],
    ] as const) {
      await expect(
        w.adapter.execute({ commandId: commandId(), externalId: 'ir2', capability, value }),
      ).rejects.toMatchObject({
        name: 'IrSchemeUnknownError',
        message:
          'IR blaster ir2 has neither published nor shown its infrared data points, so a code cannot be sent to it as data points.',
      });
    }
    expect(w.h.cloud.requests).toHaveLength(before);
    expect(w.h.cloud.commandsFor('ir2')).toStrictEqual([]);
  });

  it('refuses commands for devices outside the inventory', async () => {
    const w = await started();
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ghost',
        capability: 'power',
        value: true,
      }),
    ).rejects.toMatchObject({ name: 'TuyaDeviceUnknownError' });
  });
});
