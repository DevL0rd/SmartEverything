import { CommandRefusedError } from '@smarteverything/domain';
import { afterEach, describe, expect, it } from 'vitest';
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
  it('offers learning and sending, and lists library remotes as cloud remotes', async () => {
    const w = await started();
    const devices = await w.adapter.discover();
    expect(
      devices
        .find((device) => device.externalId === 'ir1')
        ?.capabilities.map((capability) => capability.key),
    ).toStrictEqual(['ir_learn', 'ir_send']);
    expect(devices.find((device) => device.externalId === 'tv-1')).toMatchObject({
      kind: 'ir_remote',
      parentExternalId: 'ir1',
      capabilities: [
        { key: 'remote_key', value: { kind: 'enum', options: ['power', 'volume_up'] } },
      ],
    });
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
    expect(w.h.cloud.requests.filter((request) => request.method === 'POST')).toStrictEqual([]);
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
      new CommandRefusedError(
        'ir_send',
        'it needs a format of pulses, head_key or library and a code',
      ),
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

describe('IR through the cloud', () => {
  it('presses a library remote button through the cloud', async () => {
    const w = await started();
    await w.adapter.execute({
      commandId: commandId(),
      externalId: 'tv-1',
      capability: 'remote_key',
      value: 'volume_up',
    });
    expect(
      w.h.cloud
        .calls('POST', '/v2.0/infrareds/ir1/remotes/tv-1/raw/command')
        .map((request) => request.body),
    ).toStrictEqual([{ category_id: 2, key_id: 5, key: 'volume_up' }]);
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'tv-1',
        capability: 'remote_key',
        value: 'mute',
      }),
    ).rejects.toMatchObject({ name: 'RemoteKeyError' });
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'tv-1',
        capability: 'power',
        value: true,
      }),
    ).rejects.toThrow(
      new CommandRefusedError('power', 'an IR library remote only presses its buttons'),
    );
  });

  it('sends a library key given to the blaster through the cloud', async () => {
    const w = await started();
    const code = JSON.stringify({ remoteId: 'tv-1', categoryId: 2, keyId: 1, key: 'power' });
    await w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir1',
      capability: 'ir_send',
      value: { format: 'library', code },
    });
    expect(
      w.h.cloud
        .calls('POST', '/v2.0/infrareds/ir1/remotes/tv-1/raw/command')
        .map((request) => request.body),
    ).toStrictEqual([{ category_id: 2, key_id: 1, key: 'power' }]);
  });

  it('learns on a blaster without a LAN path through the learning query and converts the code', async () => {
    const w = await started();
    const learning = w.adapter.execute({
      commandId: commandId(),
      externalId: 'ir2',
      capability: 'ir_learn',
      value: null,
    });
    await waitFor(
      () => w.h.cloud.calls('GET', '/v2.0/infrareds/ir2/learning-codes').length > 0,
      'the first query',
    );
    w.h.cloud.learnedCode = 'c4223011';
    await expect(learning).resolves.toStrictEqual({ format: 'pulses', code: 'xCIwEQ==' });
    expect(
      w.h.cloud
        .calls('PUT', '/v2.0/infrareds/ir2/learning-state')
        .map((request) => request.query.get('state')),
    ).toStrictEqual(['true', 'false']);
  });

  it('refuses to send a learned code to a blaster whose data points are unknown', async () => {
    const w = await started();
    await expect(
      w.adapter.execute({
        commandId: commandId(),
        externalId: 'ir2',
        capability: 'ir_send',
        value: { format: 'pulses', code: 'KCOUETAC' },
      }),
    ).rejects.toMatchObject({ name: 'IrSchemeUnknownError' });
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
