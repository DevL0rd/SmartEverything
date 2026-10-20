import { z } from 'zod';
import {
  IR_CODE_FORMATS,
  type IrCodeRow,
  type IrRemoteRow,
  type SearchIrRemote,
} from '@smarteverything/domain';
import type { Device } from '../../../store/state';

const LEARNED_CODE = z.object({
  format: z.enum(IR_CODE_FORMATS),
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

type Linked = Pick<Device, 'id' | 'hidden'>;

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
      pageDeviceId: remote.blaster_id,
      buttons: codesOf(remote.id, codes).map((code) => ({
        button: code.button,
        format: code.format,
        code: code.code,
      })),
    }));
}
