import { createHash } from 'node:crypto';
import { DSH_WRITER_CLAIM } from '@smarteverything/domain';
import type { DshWriterClaim } from '@smarteverything/domain';
import type { HELPER_SETTLEMENT_PROOF_DATA } from '@smarteverything/harness/process';
import type { z } from 'zod';
import type { HostStore } from '../../../store/host/host-store';

export type HelperSettlement = z.infer<typeof HELPER_SETTLEMENT_PROOF_DATA>;

export interface HelperRenewalRecord {
  readonly previousEpoch: number;
  readonly parent: DshWriterClaim;
  readonly child: DshWriterClaim;
  readonly settlement: HelperSettlement;
}

export function renewalId(child: DshWriterClaim): string {
  const hex = createHash('sha256')
    .update(`helper-claim-renewal:${child.session_id}:${String(child.epoch)}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function recordHelperRenewal(store: HostStore, input: HelperRenewalRecord): void {
  const id = renewalId(input.child);
  store.harnessSessions.begin(id, input.child.session_id, {
    kind: 'helper-claim-renewal',
    previousEpoch: input.previousEpoch,
    parent: DSH_WRITER_CLAIM.parse(input.parent),
    child: DSH_WRITER_CLAIM.parse(input.child),
    settlement: input.settlement,
  });
  store.harnessSessions.finish(id, { ok: true });
}
