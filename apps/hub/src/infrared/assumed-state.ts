import {
  IR_CODE_FORMATS,
  afterIrSend,
  modeKeysOf,
  type CommandRow,
  type DeviceRow,
  type IrCodeRow,
  type IrRemoteRow,
  type RowChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Store } from '../store/store';

type AssumedStore = Pick<Store, 'devices' | 'infrared' | 'settings'>;

export interface AssumedStateOptions {
  readonly store: AssumedStore;
  readonly now: () => Date;
  readonly log: Logger;
}

interface Sent {
  readonly remoteId: string;
  readonly key: string;
  readonly keys: readonly string[];
}

const LEARNED_CODE = z.strictObject({ format: z.enum(IR_CODE_FORMATS), code: z.string().min(1) });

function libraryKeysOf(device: DeviceRow): readonly string[] {
  const capability = device.capabilities.find((candidate) => candidate.key === 'remote_key');
  return capability?.value.kind === 'enum' ? capability.value.options : [];
}

function libraryPress(device: DeviceRow, command: CommandRow): Sent | null {
  return typeof command.value === 'string'
    ? { remoteId: device.id, key: command.value, keys: libraryKeysOf(device) }
    : null;
}

function learnedPress(
  codes: readonly IrCodeRow[],
  remotes: readonly IrRemoteRow[],
  command: CommandRow,
): readonly Sent[] {
  const sent = LEARNED_CODE.safeParse(command.value);
  if (!sent.success) {
    return [];
  }
  const own = new Set(remotes.map((remote) => remote.id));
  return codes
    .filter(
      (code) =>
        own.has(code.remote_id) && code.format === sent.data.format && code.code === sent.data.code,
    )
    .map((code) => ({
      remoteId: code.remote_id,
      key: code.button,
      keys: codes
        .filter((other) => other.remote_id === code.remote_id)
        .map((other) => other.button),
    }));
}

export class IrAssumedState {
  constructor(private readonly options: AssumedStateOptions) {}

  observe(change: RowChange): void {
    if (
      change.table === 'commands' &&
      change.record?.status === 'succeeded' &&
      change.oldRecord?.status !== 'succeeded'
    ) {
      this.sent(change.record);
    }
  }

  private sent(command: CommandRow): void {
    const device =
      command.device_id === null ? undefined : this.options.store.devices.find(command.device_id);
    if (device === undefined) {
      return;
    }
    const sent = this.sentBy(device, command);
    if (sent !== null) {
      this.record(sent);
    }
  }

  private sentBy(device: DeviceRow, command: CommandRow): Sent | null {
    if (device.kind === 'ir_remote' && command.capability === 'remote_key') {
      return libraryPress(device, command);
    }
    if (device.kind !== 'ir_blaster' || command.capability !== 'ir_send') {
      return null;
    }
    const { infrared } = this.options.store;
    const found = learnedPress(
      infrared.codes(),
      infrared.remotes().filter((remote) => remote.blaster_id === device.id),
      command,
    );
    if (found.length > 1) {
      this.options.log.debug('ir.assumed_ambiguous', {
        deviceId: device.id,
        commandId: command.id,
        matches: found.length,
      });
    }
    return found.length === 1 ? (found[0] ?? null) : null;
  }

  private record({ remoteId, key, keys }: Sent): void {
    const at = this.options.now().toISOString();
    this.options.store.settings.changeIrRemote(remoteId, (state) =>
      afterIrSend(state, key, modeKeysOf(keys), at),
    );
  }
}
