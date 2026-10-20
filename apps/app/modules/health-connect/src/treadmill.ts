import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { TREADMILL_GATT_DUMP, type TreadmillGattDump } from '@smarteverything/domain';
import { AppUpdateNeededError, type SyncProgressSubscription } from './health-connect';
import { withNativeEnrollment } from './hub-network';

interface TreadmillEvents {
  readonly onTreadmillCandidate: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class TreadmillNative extends NativeModule<TreadmillEvents> {
  startTreadmillScan(): Promise<void>;
  stopTreadmillScan(): Promise<void>;
  dumpTreadmill(address: string, name: string): Promise<unknown>;
  syncTreadmills(serverUrl: string, token: string, enrollment: string): Promise<unknown>;
  startTreadmills(): Promise<void>;
  refreshTreadmills(): Promise<void>;
  treadmillStatus(): Promise<unknown>;
  treadmillPermissions(): Promise<unknown>;
  associateTreadmill(address: string): Promise<unknown>;
}

const native = requireOptionalNativeModule<TreadmillNative>('Treadmill');

export const TREADMILL_CANDIDATE = z.strictObject({
  name: z.string().min(1),
  address: z.string().min(1),
  rssi: z.number().int(),
  services: z.array(z.string()),
});

export type TreadmillCandidate = z.infer<typeof TREADMILL_CANDIDATE>;

export const TREADMILL_STATUS = z.array(
  z.strictObject({
    deviceId: z.string(),
    address: z.string(),
    family: z.string(),
    holder: z.boolean(),
    associated: z.boolean(),
    permission: z.boolean(),
  }),
);

export type TreadmillStatus = z.infer<typeof TREADMILL_STATUS>;

export const TREADMILL_PERMISSIONS = z.strictObject({ scan: z.boolean(), connect: z.boolean() });

export type TreadmillPermissions = z.infer<typeof TREADMILL_PERMISSIONS>;

const ASSOCIATION = z.string();

export const isTreadmillLinked = native !== null;

function treadmillNative(operation: string): TreadmillNative {
  if (native === null) {
    throw new AppUpdateNeededError(operation);
  }
  return native;
}

export function addTreadmillCandidateListener(
  listener: (candidate: TreadmillCandidate) => void,
): SyncProgressSubscription {
  return treadmillNative('treadmill scanning').addListener('onTreadmillCandidate', (payload) => {
    listener(TREADMILL_CANDIDATE.parse(payload));
  });
}

export async function startTreadmillScan(): Promise<void> {
  await treadmillNative('treadmill scanning').startTreadmillScan();
}

export async function stopTreadmillScan(): Promise<void> {
  await treadmillNative('treadmill scanning').stopTreadmillScan();
}

export async function dumpTreadmill(address: string, name: string): Promise<TreadmillGattDump> {
  const text = z
    .string()
    .parse(await treadmillNative('treadmill reading').dumpTreadmill(address, name));
  return TREADMILL_GATT_DUMP.parse(JSON.parse(text));
}

export async function syncTreadmills(serverUrl: string, token: string): Promise<TreadmillStatus> {
  const source = treadmillNative('treadmill sync');
  const answer = await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.syncTreadmills(serverUrl, token, enrollment),
  );
  return TREADMILL_STATUS.parse(answer);
}

export async function startTreadmills(): Promise<void> {
  await treadmillNative('treadmill link').startTreadmills();
}

export async function refreshTreadmills(): Promise<void> {
  await treadmillNative('treadmill link').refreshTreadmills();
}

export async function treadmillStatus(): Promise<TreadmillStatus> {
  return TREADMILL_STATUS.parse(await treadmillNative('treadmill status').treadmillStatus());
}

export async function treadmillPermissions(): Promise<TreadmillPermissions> {
  return TREADMILL_PERMISSIONS.parse(
    await treadmillNative('treadmill permissions').treadmillPermissions(),
  );
}

export async function associateTreadmill(address: string): Promise<string> {
  return ASSOCIATION.parse(await treadmillNative('treadmill pairing').associateTreadmill(address));
}
