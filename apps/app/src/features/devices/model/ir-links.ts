import { z } from 'zod';
import type { IrCodeRow, IrRemoteRow, SearchIrRemote } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

const LEARNED_CODE = z.object({
  format: z.enum(['pulses', 'head_key', 'library']),
  code: z.string().min(1),
});

type LearnedCode = z.infer<typeof LEARNED_CODE>;

export type LearnOutcome =
  | { readonly kind: 'waiting' }
  | { readonly kind: 'learned'; readonly code: LearnedCode }
  | { readonly kind: 'failed'; readonly message: string };

interface CommandOutcomeRow {
  readonly status: string;
  readonly result: unknown;
  readonly error: string | null;
}

export function learnOutcome(row: CommandOutcomeRow | undefined): LearnOutcome {
  if (row === undefined || row.status === 'pending' || row.status === 'running') {
    return { kind: 'waiting' };
  }
  if (row.status !== 'succeeded') {
    return {
      kind: 'failed',
      message:
        row.status === 'expired'
          ? 'The server did not answer in time. Is the blaster online?'
          : (row.error ?? 'The blaster reported a failure without a reason.'),
    };
  }
  const code = LEARNED_CODE.safeParse(row.result);
  return code.success
    ? { kind: 'learned', code: code.data }
    : {
        kind: 'failed',
        message: `The blaster answered without a code: expected a format and a code, received ${JSON.stringify(row.result)}.`,
      };
}

type Linked = Pick<Device, 'id' | 'kind' | 'name' | 'parent_id' | 'hidden'>;

export function libraryDeviceOf(
  remote: Pick<IrRemoteRow, 'blaster_id' | 'name'>,
  devices: readonly Linked[],
): Linked | null {
  return (
    devices.find(
      (device) =>
        device.kind === 'ir_remote' &&
        device.parent_id === remote.blaster_id &&
        device.name === remote.name,
    ) ?? null
  );
}

export function remotePageOf(
  remote: Pick<IrRemoteRow, 'blaster_id' | 'name'>,
  devices: readonly Linked[],
): string {
  return libraryDeviceOf(remote, devices)?.id ?? remote.blaster_id;
}

export function remotesShownOn<T extends Pick<IrRemoteRow, 'blaster_id' | 'name'>>(
  device: Linked,
  remotes: readonly T[],
  devices: readonly Linked[],
): T[] {
  return remotes.filter((remote) => remotePageOf(remote, devices) === device.id);
}

export function blasterOf(device: Linked, devices: readonly Linked[]): Linked | null {
  if (device.kind === 'ir_blaster') {
    return device;
  }
  return devices.find((candidate) => candidate.id === device.parent_id) ?? null;
}

export function codesOf(remoteId: string, codes: readonly IrCodeRow[]): IrCodeRow[] {
  return codes.filter((code) => code.remote_id === remoteId);
}

export function irSearchRemotes(
  remotes: readonly IrRemoteRow[],
  codes: readonly IrCodeRow[],
  devices: readonly Linked[],
): SearchIrRemote[] {
  const shown = new Set(devices.filter((device) => !device.hidden).map((device) => device.id));
  return remotes
    .filter((remote) => shown.has(remote.blaster_id))
    .map((remote) => ({
      id: remote.id,
      name: remote.name,
      category: remote.category,
      brand: remote.brand,
      blasterId: remote.blaster_id,
      pageDeviceId: remotePageOf(remote, devices),
      buttons: codesOf(remote.id, codes).map((code) => ({
        button: code.button,
        format: code.format,
        code: code.code,
      })),
    }));
}
