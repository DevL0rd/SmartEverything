import { z } from 'zod';
import { APP_UPDATE_COMPATIBLE, APP_UPDATE_SUMMARY } from './app-updates';

export const WEB_BUNDLE_EMBEDDED = 'embedded';

export const WEB_UPDATE_RUNNING = z.strictObject({
  id: z.union([z.uuid(), z.literal(WEB_BUNDLE_EMBEDDED)]),
  createdAt: z.iso.datetime({ offset: true }),
});

export type WebUpdateRunning = z.infer<typeof WEB_UPDATE_RUNNING>;

export const WEB_UPDATE_APPLY_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('update'), id: APP_UPDATE_SUMMARY.shape.id }),
  z.strictObject({ kind: z.literal('built_in') }),
]);

export type WebUpdateApplyTarget = z.infer<typeof WEB_UPDATE_APPLY_TARGET>;

export const WEB_UPDATE_STATUS = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('disabled'), reason: z.string().min(1) }),
  z.strictObject({ state: z.literal('idle'), running: WEB_UPDATE_RUNNING }),
  z.strictObject({ state: z.literal('checking') }),
  z.strictObject({ state: z.literal('available'), offer: APP_UPDATE_COMPATIBLE }),
  z.strictObject({
    state: z.literal('downloading'),
    offer: APP_UPDATE_COMPATIBLE,
    received: z.int().nonnegative(),
    total: z.int().nonnegative(),
  }),
  z.strictObject({ state: z.literal('ready'), offer: APP_UPDATE_COMPATIBLE }),
  z.strictObject({ state: z.literal('rollback_ready'), currentId: z.uuid() }),
  z.strictObject({ state: z.literal('applying') }),
  z.strictObject({ state: z.literal('needs_installer'), newer: APP_UPDATE_SUMMARY }),
  z.strictObject({
    state: z.literal('failed'),
    reason: z.string().min(1),
    offer: APP_UPDATE_COMPATIBLE.nullable(),
  }),
  z.strictObject({
    state: z.literal('rolled_back'),
    failedId: z.uuid(),
    reason: z.string().min(1),
  }),
]);

export type WebUpdateStatus = z.infer<typeof WEB_UPDATE_STATUS>;
