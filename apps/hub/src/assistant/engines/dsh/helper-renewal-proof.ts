import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { DSH_WRITER_CLAIM, harnessTargetKey } from '@smarteverything/domain';
import type { DshWriterClaim } from '@smarteverything/domain';
import { HELPER_SETTLEMENT_PROOF_DATA } from '@smarteverything/harness/process';
import type { Store } from '../../../store/store';

export type HelperSettlement = z.infer<typeof HELPER_SETTLEMENT_PROOF_DATA>;

const RENEWAL = z.strictObject({
  kind: z.literal('helper-claim-renewal'),
  previousEpoch: z.int().positive(),
  parent: DSH_WRITER_CLAIM,
  child: DSH_WRITER_CLAIM,
  settlement: HELPER_SETTLEMENT_PROOF_DATA,
});

function renewalId(child: DshWriterClaim): string {
  const hex = createHash('sha256')
    .update(`helper-claim-renewal:${child.session_id}:${String(child.epoch)}`)
    .digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function matchesRetainedParent(
  retained: DshWriterClaim,
  parent: DshWriterClaim,
  child: DshWriterClaim,
): boolean {
  return (
    retained.session_id === parent.session_id &&
    retained.epoch <= parent.epoch &&
    retained.runtime_instance === child.runtime_instance &&
    retained.connection_generation === child.connection_generation &&
    harnessTargetKey(retained.target) === harnessTargetKey(parent.target)
  );
}

export function retainedHelperSettlement(
  store: Store,
  child: DshWriterClaim,
  parent: DshWriterClaim,
  nextSeq: number,
): HelperSettlement | undefined {
  const receipt = store.harnessSessions.operation(renewalId(child));
  if (receipt?.state !== 'completed' || receipt.session_id !== child.session_id) return undefined;
  const parsed = RENEWAL.parse(JSON.parse(receipt.request));
  if (!isDeepStrictEqual(parsed.child, child) || parsed.previousEpoch + 1 !== child.epoch)
    return undefined;
  if (!matchesRetainedParent(parsed.parent, parent, child)) return undefined;
  const { settlement } = parsed;
  return settlement.childSessionId === child.session_id && settlement.nextSeq === nextSeq
    ? settlement
    : undefined;
}

export function rememberHelperRenewal(
  store: Store,
  input: {
    readonly previousEpoch: number;
    readonly parent: DshWriterClaim;
    readonly child: DshWriterClaim;
    readonly settlement: HelperSettlement;
  },
): void {
  const renewal = RENEWAL.parse({ ...input, kind: 'helper-claim-renewal' });
  const id = renewalId(input.child);
  store.harnessSessions.begin(id, input.child.session_id, renewal);
  store.harnessSessions.finish(id, { ok: true });
}
