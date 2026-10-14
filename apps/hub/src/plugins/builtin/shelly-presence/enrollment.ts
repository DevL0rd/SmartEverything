import { shellyHttp } from './http-transport';
import { boundedText } from './http';
import { createHash } from 'node:crypto';
import {
  ApiError,
  SHELLY_PRESENCE_ADDRESS,
  SHELLY_PRESENCE_ENROLL_REQUEST,
  SHELLY_TRANSPORT_TLS,
  type ShellyTransportTls,
  SHELLY_DEVICE_INFO,
  JSON_VALUE,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { PluginRecords, PluginSecrets } from '../contract';

export const SHELLY_ADDRESS = SHELLY_PRESENCE_ADDRESS;
export const SHELLY_ENROLL_INPUT = SHELLY_PRESENCE_ENROLL_REQUEST;
export const SHELLY_ENROLLMENT = z.object({
  info: SHELLY_DEVICE_INFO,
  address: SHELLY_ADDRESS,
  secret: z.string().nullable(),
  generations: z.record(z.string(), z.int().nonnegative()),
  activeZones: z.array(z.int().nonnegative()).max(64),
  tlsSecret: z.string().nullable().default(null),
});
export type ShellyEnrollment = z.output<typeof SHELLY_ENROLLMENT>;
export async function enrollShelly(
  input: z.output<typeof SHELLY_ENROLL_INPUT>,
  records: PluginRecords,
  secrets: PluginSecrets,
): Promise<ShellyEnrollment> {
  const sameAddress = enrolledDevices(records).find((device) => device.address === input.address);
  const transport =
    input.tls === undefined && sameAddress !== undefined
      ? enrollmentTls(sameAddress, secrets)
      : (input.tls ?? null);
  const response = await shellyHttp(new URL('/shelly', input.address), {
    signal: AbortSignal.timeout(10000),
    tls: transport,
  });
  if (!response.ok)
    throw new ApiError(
      'upstream_failed',
      `The Shelly identity endpoint returned HTTP ${String(response.status)}.`,
    );
  const info = SHELLY_DEVICE_INFO.parse(JSON.parse(await boundedText(response)));
  if (info.gen !== 4 || info.model !== 'S4SN-0U61X')
    throw new ApiError('invalid_request', 'That address is not a Shelly Presence Gen4 sensor.');
  const previous = records.get(info.id);
  const known = previous === null ? null : SHELLY_ENROLLMENT.parse(previous);
  const key = `password_${createHash('sha256').update(info.id).digest('hex').slice(0, 24)}`;
  if (input.password !== null) await secrets.set(key, input.password);
  const enrollment = enrollmentRecord(
    info,
    input.address,
    input.password === null ? null : key,
    known,
  );
  const secured = await secureEnrollment(input.tls, known, enrollment, secrets);
  saveEnrollment(records, secured);
  return secured;
}
export function enrolledDevices(records: PluginRecords): readonly ShellyEnrollment[] {
  return records.list().map((record) => SHELLY_ENROLLMENT.parse(record.value));
}
export function saveEnrollment(records: PluginRecords, enrollment: ShellyEnrollment): void {
  const raw: unknown = JSON.parse(JSON.stringify(enrollment));
  const value = JSON_VALUE.parse(raw);
  records.put(enrollment.info.id, value);
}

function enrollmentRecord(
  info: ShellyEnrollment['info'],
  address: string,
  secret: string | null,
  known: ShellyEnrollment | null,
): ShellyEnrollment {
  return {
    info,
    address,
    secret: secret ?? known?.secret ?? null,
    generations: known?.generations ?? {},
    activeZones: known?.activeZones ?? [],
    tlsSecret: known?.tlsSecret ?? null,
  };
}

export function enrollmentTls(
  enrollment: ShellyEnrollment,
  secrets: PluginSecrets,
): ShellyTransportTls | null {
  if (enrollment.tlsSecret === null) return null;
  const value = secrets.get(enrollment.tlsSecret);
  if (value === null)
    throw new ApiError(
      'conflict',
      'The saved controller TLS material is unavailable. Re-enroll this device with its certificate.',
    );
  return SHELLY_TRANSPORT_TLS.parse(JSON.parse(value));
}
async function secureEnrollment(
  tls: ShellyTransportTls | null | undefined,
  known: ShellyEnrollment | null,
  enrollment: ShellyEnrollment,
  secrets: PluginSecrets,
): Promise<ShellyEnrollment> {
  if (tls === undefined) return enrollment;
  const tlsKey = `tls_${createHash('sha256').update(enrollment.info.id).digest('hex').slice(0, 24)}`;
  if (tls === null) {
    if (known?.tlsSecret !== null && known?.tlsSecret !== undefined)
      await secrets.remove(known.tlsSecret);
  } else await secrets.set(tlsKey, JSON.stringify(tls));
  return { ...enrollment, tlsSecret: tls === null ? null : tlsKey };
}
