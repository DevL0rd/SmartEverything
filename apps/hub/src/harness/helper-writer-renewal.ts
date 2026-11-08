import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type { DshSessionOpened, DshWriterClaim } from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import type { HarnessGrant } from './grant';

export function renewHelperWriter(
  store: Store,
  child: DshWriterClaim,
  principal: DshSessionPrincipal,
  grant: HarnessGrant,
): DshSessionOpened {
  const previous = store.harnessSessions.state(child.session_id);
  if (previous === undefined)
    throw new ApiError('conflict', 'The helper has no retained native projection.');
  const opened = store.dshSessions.acquire(
    {
      session_id: child.session_id,
      target: principal.target,
      runtime_instance: principal.runtime_instance,
      connection_generation: principal.connection_generation,
    },
    principal,
  );
  store.harnessSessions.issue({
    ...grant,
    runtime_instance: opened.claim.runtime_instance,
    generation: opened.claim.connection_generation,
  });
  store.harnessSessions.project(
    {
      ...previous,
      metadata: opened.metadata,
      epoch: opened.claim.epoch,
      state: 'idle',
      interactions: [],
      work: [],
      failure: null,
    },
    0,
  );
  return opened;
}

export function resumeHelperWriter(
  store: Store,
  {
    id,
    parent,
    principal,
    grant,
  }: {
    readonly id: string;
    readonly parent: DshWriterClaim;
    readonly principal: DshSessionPrincipal;
    readonly grant: HarnessGrant;
  },
): DshSessionOpened {
  return store.durableWrite(() => {
    store.dshSessions.verifyWriter(parent, principal);
    const metadata = store.dshSessions.stat(id, principal.profile_id);
    const child = store.dshSessions.attached(id, principal.profile_id);
    if (
      metadata?.header.origin !== 'subagent' ||
      metadata.header.parentSession !== parent.session_id ||
      child === null ||
      grant.profile_id !== principal.profile_id ||
      harnessTargetKey(child.target) !== harnessTargetKey(parent.target)
    )
      throw new ApiError(
        'forbidden',
        'Only the current direct parent can resume its retained helper.',
      );
    if (
      child.runtime_instance === principal.runtime_instance &&
      child.connection_generation === principal.connection_generation
    )
      return { claim: child, metadata };
    return renewHelperWriter(store, child, principal, grant);
  });
}
