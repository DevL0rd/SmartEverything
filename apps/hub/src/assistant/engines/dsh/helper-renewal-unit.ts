import { ApiError } from '@smarteverything/domain';
import type { DshWriterClaim } from '@smarteverything/domain';
import { renewHelperWriter } from '../../../harness/helper-writer-renewal';
import type { HarnessGrant } from '../../../harness/grant';
import { durableStoreUnit } from '../../../store/host/unit';
import type { HeldChats } from '../../../store/repositories/ai-chat-removal-hold';
import type { DshSessionPrincipal } from '../../../store/repositories/dsh-session-claims';
import type { Store } from '../../../store/store';
import { recordHelperRenewal, type HelperSettlement } from './helper-renewal-record';

export interface HelperRenewal {
  readonly child: DshWriterClaim;
  readonly parent: DshWriterClaim;
  readonly principal: DshSessionPrincipal;
  readonly grant: HarnessGrant;
  readonly settlement: HelperSettlement;
  readonly held: HeldChats;
}

function renewedHelperWriter(
  store: Store,
  { child, parent, principal, grant, settlement, held }: HelperRenewal,
): DshWriterClaim {
  store.dshSessions.verifyWriter(parent, principal);
  const retained = store.dshSessions.attached(child.session_id, grant.profile_id);
  if (retained?.epoch !== child.epoch)
    throw new ApiError('conflict', 'A different writer already holds this helper.');
  const { claim, metadata: renewed } = renewHelperWriter(store, {
    child,
    principal,
    grant,
    held,
  });
  if (renewed.next_seq !== settlement.nextSeq)
    throw new ApiError('conflict', 'The helper log changed before writer renewal.');
  recordHelperRenewal(store, { previousEpoch: child.epoch, parent, child: claim, settlement });
  return claim;
}

export const HELPER_WRITER_RENEW_UNIT = durableStoreUnit(renewedHelperWriter);
