import {
  IR_CODE_FORMATS,
  afterIrSend,
  modeKeysOf,
  withIrChange,
  type CommandRow,
  type DeviceRow,
  type IrApplianceApply,
  type IrCodeRow,
  type IrRemoteRow,
  type IrRemoteState,
} from '@smarteverything/domain';
import { z } from 'zod';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';

interface Sent {
  readonly remoteId: string;
  readonly key: string;
  readonly keys: readonly string[];
}

const LEARNED_CODE = z.strictObject({ format: z.enum(IR_CODE_FORMATS), code: z.string().min(1) });

function deviceRemoteKeysOf(device: DeviceRow): readonly string[] {
  const capability = device.capabilities.find((candidate) => candidate.key === 'remote_key');
  return capability?.value.kind === 'enum' ? capability.value.options : [];
}

function deviceRemotePress(device: DeviceRow, command: CommandRow): Sent | null {
  return typeof command.value === 'string'
    ? { remoteId: device.id, key: command.value, keys: deviceRemoteKeysOf(device) }
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

function pressesOf(store: Store, device: DeviceRow, command: CommandRow): readonly Sent[] {
  if (device.kind === 'ir_remote' && command.capability === 'remote_key') {
    const sent = deviceRemotePress(device, command);
    return sent === null ? [] : [sent];
  }
  if (device.kind !== 'ir_blaster' || command.capability !== 'ir_send') {
    return [];
  }
  return learnedPress(
    store.infrared.codes(),
    store.infrared.remotes().filter((remote) => remote.blaster_id === device.id),
    command,
  );
}

export const IR_ASSUMED_PRESS_UNIT = storeUnit(
  (store, { command, at }: { readonly command: CommandRow; readonly at: string }): number => {
    const device = command.device_id === null ? undefined : store.devices.find(command.device_id);
    if (device === undefined) return 0;
    const found = pressesOf(store, device, command);
    const [only] = found;
    if (found.length === 1 && only !== undefined) {
      store.settings.changeIrRemote(only.remoteId, (state) =>
        afterIrSend(state, only.key, modeKeysOf(only.keys), at),
      );
    }
    return found.length;
  },
);

export interface IrSendStep {
  readonly remoteId: string;
  readonly key: string;
  readonly modes: readonly string[];
  readonly at: string;
}

export const IR_REMOTE_SENT_UNIT = storeUnit((store, step: IrSendStep): IrRemoteState => {
  store.settings.changeIrRemote(step.remoteId, (state) =>
    afterIrSend(state, step.key, step.modes, step.at),
  );
  return store.settings.irRemote(step.remoteId);
});

export const IR_REMOTE_GOAL_UNIT = storeUnit(
  (
    store,
    { remoteId, goal }: { readonly remoteId: string; readonly goal: IrApplianceApply },
  ): IrRemoteState => {
    store.settings.changeIrRemote(remoteId, (state) => withIrChange(state, goal));
    return store.settings.irRemote(remoteId);
  },
);

export const REMOVE_IR_APPLIANCE_UNIT = storeUnit((store, applianceId: string): void => {
  store.irAppliances.remove(applianceId);
  store.settings.forgetIrRemote(applianceId);
});
