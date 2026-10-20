import { NativeModule, requireOptionalNativeModule } from 'expo';
import { z } from 'zod';
import { BRUSH_BRANDS, BRUSH_GATT_DUMP, type BrushBrand } from '@smarteverything/domain';
import { AppUpdateNeededError, type SyncProgressSubscription } from './health-connect';
import { withNativeEnrollment } from './hub-network';

interface ToothbrushEvents {
  readonly onBrushCandidate: (payload: unknown) => void;
  readonly [event: string]: (payload: unknown) => void;
}

declare class ToothbrushNative extends NativeModule<ToothbrushEvents> {
  startBrushScan(brands: readonly string[]): Promise<void>;
  stopBrushScan(): Promise<void>;
  associateBrush(stack: string): Promise<unknown>;
  bondBrush(address: string): Promise<unknown>;
  brushBonded(address: string): Promise<unknown>;
  dumpBrush(address: string, name: string, brand: string): Promise<unknown>;
  syncBrushes(serverUrl: string, token: string, enrollment: string): Promise<unknown>;
  startBrushes(): Promise<void>;
  refreshBrushes(): Promise<void>;
  brushStatus(): Promise<unknown>;
  brushPermissions(): Promise<unknown>;
}

const native = requireOptionalNativeModule<ToothbrushNative>('Toothbrush');

export const BRUSH_STACKS = ['classic', 'condor', 'oralb'] as const;

export const BRUSH_CANDIDATE = z.strictObject({
  name: z.string().min(1),
  address: z.string().min(1),
  rssi: z.number().int(),
  brand: z.enum(BRUSH_BRANDS),
  stack: z.enum(BRUSH_STACKS),
  advert: z.string().nullable(),
});

export type BrushCandidate = z.infer<typeof BRUSH_CANDIDATE>;

export const BRUSH_LINK_STATUS = z.array(
  z.strictObject({
    deviceId: z.string(),
    address: z.string(),
    brand: z.enum(BRUSH_BRANDS),
    transport: z.enum(['gatt', 'condor']),
    holder: z.boolean(),
    associated: z.boolean(),
    permission: z.boolean(),
  }),
);

export type BrushLinkStatus = z.infer<typeof BRUSH_LINK_STATUS>;

export const BRUSH_PERMISSIONS = z.strictObject({
  scan: z.boolean(),
  connect: z.boolean(),
  philipsApp: z.boolean(),
});

export type BrushPermissions = z.infer<typeof BRUSH_PERMISSIONS>;

export const BRUSH_DUMP = z.strictObject({ gatt: BRUSH_GATT_DUMP, bonded: z.boolean() });

export type BrushDump = z.infer<typeof BRUSH_DUMP>;

export const isBrushLinked = native !== null;

function brushNative(operation: string): ToothbrushNative {
  if (native === null) {
    throw new AppUpdateNeededError(operation);
  }
  return native;
}

export function addBrushCandidateListener(
  listener: (candidate: BrushCandidate) => void,
): SyncProgressSubscription {
  return brushNative('toothbrush scanning').addListener('onBrushCandidate', (payload) => {
    listener(BRUSH_CANDIDATE.parse(payload));
  });
}

export async function startBrushScan(brands: readonly BrushBrand[]): Promise<void> {
  await brushNative('toothbrush scanning').startBrushScan(brands);
}

export async function stopBrushScan(): Promise<void> {
  await brushNative('toothbrush scanning').stopBrushScan();
}

export async function associateBrush(stack: BrushCandidate['stack']): Promise<string> {
  return z.string().parse(await brushNative('toothbrush pairing').associateBrush(stack));
}

export async function bondBrush(address: string): Promise<boolean> {
  return z.boolean().parse(await brushNative('toothbrush pairing').bondBrush(address));
}

export async function brushBonded(address: string): Promise<boolean> {
  return z.boolean().parse(await brushNative('toothbrush pairing').brushBonded(address));
}

export async function dumpBrush(
  address: string,
  name: string,
  brand: BrushBrand,
): Promise<BrushDump> {
  const text = z
    .string()
    .parse(await brushNative('toothbrush reading').dumpBrush(address, name, brand));
  return BRUSH_DUMP.parse(JSON.parse(text));
}

export async function syncBrushes(serverUrl: string, token: string): Promise<BrushLinkStatus> {
  const source = brushNative('toothbrush sync');
  const answer = await withNativeEnrollment(serverUrl, token, (enrollment) =>
    source.syncBrushes(serverUrl, token, enrollment),
  );
  return BRUSH_LINK_STATUS.parse(answer);
}

export async function startBrushes(): Promise<void> {
  await brushNative('toothbrush link').startBrushes();
}

export async function refreshBrushes(): Promise<void> {
  await brushNative('toothbrush link').refreshBrushes();
}

export async function brushStatus(): Promise<BrushLinkStatus> {
  return BRUSH_LINK_STATUS.parse(await brushNative('toothbrush status').brushStatus());
}

export async function brushPermissions(): Promise<BrushPermissions> {
  return BRUSH_PERMISSIONS.parse(await brushNative('toothbrush permissions').brushPermissions());
}
