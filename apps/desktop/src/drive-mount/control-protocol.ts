import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { DESKTOP_DRIVE_COMMAND, DESKTOP_DRIVE_STATE } from '@smarteverything/domain';
import { z } from 'zod';

const COUNT = z.int().nonnegative();
const NAME = z.string().min(1);

export const DRIVE_CONTROL_REQUEST = z
  .strictObject({
    id: COUNT,
    request: z.discriminatedUnion('op', [
      z.strictObject({ op: z.literal('state') }),
      z.strictObject({ op: z.literal('command'), command: DESKTOP_DRIVE_COMMAND }),
    ]),
  })
  .readonly();

export type DriveControlRequest = z.infer<typeof DRIVE_CONTROL_REQUEST>;

export const DRIVE_CONTROL_FRAME = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('state'), state: DESKTOP_DRIVE_STATE }),
  z.strictObject({
    type: z.literal('reply'),
    id: COUNT,
    result: z.discriminatedUnion('ok', [
      z.strictObject({ ok: z.literal(true), state: DESKTOP_DRIVE_STATE }),
      z.strictObject({ ok: z.literal(false), message: NAME }),
    ]),
  }),
]);

export type DriveControlFrame = z.infer<typeof DRIVE_CONTROL_FRAME>;

export function driveControlAddress(platform: NodeJS.Platform, dataDirectory: string): string {
  if (platform === 'win32') {
    const key = createHash('sha256').update(dataDirectory).digest('hex').slice(0, 24);
    return `\\\\.\\pipe\\smarteverything-drive-${key}`;
  }
  return join(dataDirectory, 'drive-control.sock');
}
