import { createHash } from 'node:crypto';
import { ApiError, JSON_VALUE } from '@smarteverything/domain';
import type { SHELLY_ENROLL_REQUEST } from '@smarteverything/shelly';
import {
  SHELLY_ADDRESS,
  SHELLY_DEVICE_INFO,
  SHELLY_TRANSPORT_TLS,
  type ShellyTransportTls,
} from '@smarteverything/shelly';
import { z } from 'zod';
import type { PluginRecords, PluginSecrets } from '../contract';
import { openShellyRpc } from './connection';
import { readBounded, shellyHttp } from './http';

const IDENTITY_BYTES = 65536;
const METHODS = z.object({ methods: z.array(z.string()) });

const SHELLY_ENROLLMENT = z.object({
  info: SHELLY_DEVICE_INFO,
  address: SHELLY_ADDRESS,
  secret: z.string().nullable(),
  generations: z.record(z.string(), z.int().nonnegative()),
  activeZones: z.array(z.int().nonnegative()),
  tlsSecret: z.string().nullable().default(null),
});
export type ShellyEnrollment = z.output<typeof SHELLY_ENROLLMENT>;
export type ShellyEnrollInput = z.output<typeof SHELLY_ENROLL_REQUEST>;

export function enrolledDevices(records: PluginRecords): readonly ShellyEnrollment[] {
  return records.list().map((record) => SHELLY_ENROLLMENT.parse(record.value));
}

export function saveEnrollment(records: PluginRecords, enrollment: ShellyEnrollment): void {
  const raw: unknown = JSON.parse(JSON.stringify(enrollment));
  records.put(enrollment.info.id, JSON_VALUE.parse(raw));
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

function hashedName(prefix: string, id: string): string {
  return `${prefix}_${createHash('sha256').update(id).digest('hex').slice(0, 24)}`;
}

async function identityOf(
  address: string,
  tls: ShellyTransportTls | null,
): Promise<z.output<typeof SHELLY_DEVICE_INFO>> {
  const response = await shellyHttp(new URL('/shelly', address), {
    signal: AbortSignal.timeout(10000),
    tls,
  });
  if (!response.ok)
    throw new ApiError('upstream_failed', `The device answered HTTP ${String(response.status)}.`);
  const info = SHELLY_DEVICE_INFO.parse(JSON.parse(await readBounded(response, IDENTITY_BYTES)));
  if (info.gen < 2) throw new ApiError('invalid_request', 'That device is older than Gen2.');
  return info;
}

async function requirePresence(
  address: string,
  info: z.output<typeof SHELLY_DEVICE_INFO>,
  password: string | null,
  tls: ShellyTransportTls | null,
): Promise<void> {
  const rpc = await openShellyRpc({
    address,
    id: info.id,
    password,
    tls,
    signal: AbortSignal.timeout(20000),
  });
  try {
    const { methods } = await rpc.call('Shelly.ListMethods', {}, METHODS);
    if (!methods.some((method) => method.toLowerCase().startsWith('presence.')))
      throw new ApiError('invalid_request', 'That device has no Presence component.');
  } finally {
    rpc.close();
  }
}

function inheritedTls(
  input: ShellyEnrollInput,
  records: PluginRecords,
  secrets: PluginSecrets,
): ShellyTransportTls | null {
  if (input.tls !== undefined) return input.tls;
  const same = enrolledDevices(records).find((device) => device.address === input.address);
  return same === undefined ? null : enrollmentTls(same, secrets);
}

async function saveSecrets(
  input: ShellyEnrollInput,
  id: string,
  known: ShellyEnrollment | null,
  secrets: PluginSecrets,
): Promise<Pick<ShellyEnrollment, 'secret' | 'tlsSecret'>> {
  const passwordName = hashedName('password', id);
  if (input.password !== null) await secrets.set(passwordName, input.password);
  const secret = input.password === null ? (known?.secret ?? null) : passwordName;
  const tlsSecret = known?.tlsSecret ?? null;
  if (input.tls === undefined) return { secret, tlsSecret };
  if (tlsSecret !== null) await secrets.remove(tlsSecret);
  if (input.tls === null) return { secret, tlsSecret: null };
  const tlsName = hashedName('tls', id);
  await secrets.set(tlsName, JSON.stringify(input.tls));
  return { secret, tlsSecret: tlsName };
}

function savedPassword(known: ShellyEnrollment | null, secrets: PluginSecrets): string | null {
  return known?.secret === undefined || known.secret === null ? null : secrets.get(known.secret);
}

export async function enrollShelly(
  input: ShellyEnrollInput,
  records: PluginRecords,
  secrets: PluginSecrets,
): Promise<ShellyEnrollment> {
  const tls = inheritedTls(input, records, secrets);
  const info = await identityOf(input.address, tls);
  const previous = records.get(info.id);
  const known = previous === null ? null : SHELLY_ENROLLMENT.parse(previous);
  await requirePresence(input.address, info, input.password ?? savedPassword(known, secrets), tls);
  const enrollment: ShellyEnrollment = {
    info,
    address: input.address,
    generations: known?.generations ?? {},
    activeZones: known?.activeZones ?? [],
    ...(await saveSecrets(input, info.id, known, secrets)),
  };
  saveEnrollment(records, enrollment);
  return enrollment;
}
