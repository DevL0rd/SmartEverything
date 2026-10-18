import { z } from 'zod';
import type { PluginRecords } from '../contract';

const HOST_KEY_RECORD = 'host_key';
const HOST_PIN = z.strictObject({ host: z.string(), fingerprint: z.string() });

export function pinnedFingerprint(records: PluginRecords, host: string): string | null {
  const pin = HOST_PIN.safeParse(records.get(HOST_KEY_RECORD));
  return pin.success && pin.data.host === host ? pin.data.fingerprint : null;
}

export function pinHostKey(records: PluginRecords, host: string, fingerprint: string): void {
  records.put(HOST_KEY_RECORD, { host, fingerprint });
}

export function forgetHostKey(records: PluginRecords): void {
  records.remove(HOST_KEY_RECORD);
}
