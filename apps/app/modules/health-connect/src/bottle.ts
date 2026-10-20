import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { BOTTLE_DEVICE_INFORMATION, BOTTLE_SERIAL } from '@smarteverything/domain';
import { AppUpdateNeededError, type SyncProgressSubscription } from './health-connect';
import { withNativeEnrollment } from './hub-network';

interface BottleEvents {
  readonly onLarqCandidate: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class BottleNative extends NativeModule<BottleEvents> {
  startLarqScan(): Promise<void>;
  stopLarqScan(): Promise<void>;
  readLarq(address: string): Promise<unknown>;
  syncBottles(serverUrl: string, token: string, enrollment: string): Promise<unknown>;
  refreshBottles(): Promise<void>;
  bottleStatus(): Promise<unknown>;
  bottlePermissions(): Promise<unknown>;
}

const native = requireOptionalNativeModule<BottleNative>('Larq');

const BOTTLE_CANDIDATE = z.strictObject({
  name: z.string().min(1),
  serial: BOTTLE_SERIAL,
  address: z.string().min(1),
  rssi: z.number().int(),
});

export type BottleCandidate = z.infer<typeof BOTTLE_CANDIDATE>;

const BOTTLE_STATUS = z.array(
  z.strictObject({
    deviceId: z.string(),
    serial: BOTTLE_SERIAL,
    scan: z.boolean(),
    connect: z.boolean(),
  }),
);

export type BottleStatus = z.infer<typeof BOTTLE_STATUS>;

const BOTTLE_PERMISSIONS = z.strictObject({ scan: z.boolean(), connect: z.boolean() });

export type BottlePermissions = z.infer<typeof BOTTLE_PERMISSIONS>;

const BOTTLE_READOUT = z.strictObject({
  dis: BOTTLE_DEVICE_INFORMATION,
  battery: z.number().int().min(0).max(100).nullable(),
});

export type BottleReadout = z.infer<typeof BOTTLE_READOUT>;

export const isBottleLinked = native !== null;

function bottleNative(operation: string): BottleNative {
  if (native === null) {
    throw new AppUpdateNeededError(operation);
  }
  return native;
}

export function addBottleCandidateListener(
  listener: (candidate: BottleCandidate) => void,
): SyncProgressSubscription {
  return bottleNative('bottle scanning').addListener('onLarqCandidate', (payload) => {
    listener(BOTTLE_CANDIDATE.parse(payload));
  });
}

export async function startBottleScan(): Promise<void> {
  await bottleNative('bottle scanning').startLarqScan();
}

export async function stopBottleScan(): Promise<void> {
  await bottleNative('bottle scanning').stopLarqScan();
}

export async function readBottle(address: string): Promise<BottleReadout> {
  const text = z.string().parse(await bottleNative('bottle reading').readLarq(address));
  return BOTTLE_READOUT.parse(JSON.parse(text));
}

export async function syncBottles(serverUrl: string, token: string): Promise<BottleStatus> {
  const source = bottleNative('bottle sync');
  const answer = await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.syncBottles(serverUrl, token, enrollment),
  );
  return BOTTLE_STATUS.parse(answer);
}

export async function refreshBottles(): Promise<void> {
  await bottleNative('bottle link').refreshBottles();
}

export async function bottleStatus(): Promise<BottleStatus> {
  return BOTTLE_STATUS.parse(await bottleNative('bottle status').bottleStatus());
}

export async function bottlePermissions(): Promise<BottlePermissions> {
  return BOTTLE_PERMISSIONS.parse(await bottleNative('bottle permissions').bottlePermissions());
}
