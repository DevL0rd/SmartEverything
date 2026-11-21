import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { DSH_WRITER_CLAIM, harnessTargetKey } from '@smarteverything/domain';
import type { DshWriterClaim } from '@smarteverything/domain';
import { HELPER_SETTLEMENT_PROOF_DATA } from '@smarteverything/harness/process';
import type { Store } from '../../../store/store';
import { renewalId, type HelperSettlement } from './helper-renewal-record';

export type { HelperSettlement };

const RENEWAL = z.strictObject({
  kind: z.literal('helper-claim-renewal'),
  previousEpoch: z.int().positive(),
  parent: DSH_WRITER_CLAIM,
  child: DSH_WRITER_CLAIM,
  settlement: HELPER_SETTLEMENT_PROOF_DATA,
});

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

export async function retainedHelperSettlement(
  store: Pick<Store, 'host'>,
  child: DshWriterClaim,
  parent: DshWriterClaim,
  nextSeq: number,
): Promise<HelperSettlement | undefined> {
  const receipt = await store.host.call('harnessSessions', 'operation', renewalId(child));
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
