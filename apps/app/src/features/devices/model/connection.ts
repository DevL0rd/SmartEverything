import { z } from 'zod';
import { PROVIDER_INFO } from '@smarteverything/domain';
import type { Device } from '../../../store/state';

const TRANSPORT = z.object({ transport: z.enum(['lan', 'cloud']) });

export function connectionOf(device: Device): string | null {
  const parsed = TRANSPORT.safeParse(device.details);
  if (!parsed.success) {
    return null;
  }
  return parsed.data.transport === 'lan'
    ? 'On your network'
    : `Through ${PROVIDER_INFO[device.provider].name} cloud`;
}

const DETAIL_TEXT = z.object({
  transportReason: z.string().optional(),
  updates: z.string().optional(),
  ip: z.string().nullable().optional(),
});

export type DeviceDetailText = z.infer<typeof DETAIL_TEXT>;

export function detailTextOf(device: Device): DeviceDetailText | null {
  const parsed = DETAIL_TEXT.safeParse(device.details);
  return parsed.success ? parsed.data : null;
}
