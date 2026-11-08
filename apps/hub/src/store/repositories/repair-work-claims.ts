import { REPAIR_WORK_COMPONENT, type RepairWorkComponent } from '@smarteverything/domain';
import { z } from 'zod';
import type { SettingsKvRepository } from './settings-kv';

const KEY = 'repair-work-claims';
const LEASE_MS = 24 * 60 * 60 * 1000;
const MAX_CLAIMS = 256;

const CLAIM = z.strictObject({
  component: REPAIR_WORK_COMPONENT,
  chatId: z.uuid(),
  profileId: z.uuid(),
  claimedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});

const STORED = z.strictObject({ claims: z.array(CLAIM).max(MAX_CLAIMS) });

export type RepairWorkClaim = z.infer<typeof CLAIM>;

export function repairWorkClaims(settings: SettingsKvRepository): readonly RepairWorkClaim[] {
  const saved = settings.read(KEY);
  return saved === null ? [] : STORED.parse(saved).claims;
}

function retained(
  claims: readonly RepairWorkClaim[],
  claim: RepairWorkClaim,
): readonly RepairWorkClaim[] {
  const older = claims.filter(
    (row) => row.component !== claim.component || row.chatId !== claim.chatId,
  );
  const previous = older.find((row) => row.component === claim.component);
  return [
    claim,
    ...older.filter((row) => row.component !== claim.component || row === previous),
  ].slice(0, MAX_CLAIMS);
}

export function saveRepairWorkClaim(
  settings: SettingsKvRepository,
  target: {
    readonly component: RepairWorkComponent;
    readonly chatId: string;
    readonly profileId: string;
  },
  now: Date,
): RepairWorkClaim {
  const claims = repairWorkClaims(settings);
  const claimedAt = now.toISOString();
  const active = claims.find(
    (row) =>
      row.component === target.component &&
      row.chatId === target.chatId &&
      row.profileId === target.profileId &&
      row.expiresAt > claimedAt,
  );
  const claim = CLAIM.parse({
    ...target,
    claimedAt: active?.claimedAt ?? claimedAt,
    expiresAt: new Date(now.getTime() + LEASE_MS).toISOString(),
  });
  settings.save(KEY, { claims: retained(claims, claim) });
  return claim;
}
