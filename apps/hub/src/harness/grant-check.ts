import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiHarnessHost,
  DshWriterClaim,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import type { HostStore } from '../store/host/host-store';
import type { HarnessGrant } from './grant';

export function checkedGrant(
  store: Pick<HostStore, 'harnessSessions' | 'dshSessions' | 'aiChats'>,
  id: string,
): HarnessGrant {
  const grant = store.harnessSessions.grant(id);
  if (grant === undefined)
    throw new ApiError(
      'forbidden',
      'This native session has no active conversation execution grant.',
    );
  const metadata = store.dshSessions.stat(id, grant.profile_id);
  if (metadata === undefined)
    throw new ApiError('forbidden', 'This native session has no stored conversation.');
  const chat = store.aiChats.chat(metadata.chat_id);
  if (
    chat.profile_id !== grant.profile_id ||
    chat.engine.kind !== 'dsh' ||
    chat.engine.session_id !== id
  )
    throw new ApiError('forbidden', 'The conversation no longer authorizes this native session.');
  return grant;
}

export const GRANT_CHECK_UNIT = storeUnit(checkedGrant);

export interface WriterCheck {
  readonly id: string;
  readonly host: Pick<AiHarnessHost, 'target' | 'platform'>;
  readonly runtime_instance: string;
  readonly connection_generation: string;
  readonly claim?: DshWriterClaim;
  readonly subscription?: HarnessSubscriptionUse;
}

export interface CheckedWriter {
  readonly grant: HarnessGrant;
  readonly principal: DshSessionPrincipal;
  readonly claim: DshWriterClaim | null;
}

function admitSubscription(grant: HarnessGrant, input: HarnessSubscriptionUse): void {
  if (grant.route.route_id !== input.route_id || grant.route.model !== input.model)
    throw new ApiError(
      'forbidden',
      'Subscription inference differs from this session’s selected route, model or account revision. Select and reopen the route explicitly.',
    );
}

function verifiedClaim(
  store: Pick<HostStore, 'dshSessions'>,
  claim: DshWriterClaim,
  principal: DshSessionPrincipal,
): DshWriterClaim {
  try {
    return store.dshSessions.verifyWriter(claim, principal);
  } catch (error) {
    if (error instanceof ApiError) throw new ApiError('ownership_lost', error.message);
    throw error;
  }
}

export function checkedWriter(
  store: Pick<HostStore, 'harnessSessions' | 'dshSessions' | 'aiChats'>,
  input: WriterCheck,
): CheckedWriter {
  const grant = checkedGrant(store, input.id);
  if (input.subscription !== undefined) admitSubscription(grant, input.subscription);
  if (harnessTargetKey(grant.target) !== harnessTargetKey(input.host.target))
    throw new ApiError('forbidden', 'This runtime is not the granted conversation execution host.');
  const principal: DshSessionPrincipal = {
    profile_id: grant.profile_id,
    target: grant.target,
    runtime_instance: input.runtime_instance,
    connection_generation: input.connection_generation,
    platform: input.host.platform,
  };
  return {
    grant,
    principal,
    claim: input.claim === undefined ? null : verifiedClaim(store, input.claim, principal),
  };
}

export const WRITER_CHECK_UNIT = storeUnit(checkedWriter);

export function readerSession(
  store: Pick<HostStore, 'harnessSessions' | 'dshSessions'>,
  input: { readonly id: string; readonly runtime_instance: string },
): string {
  const metadata = store.dshSessions.ownerOf(input.id);
  if (metadata === undefined)
    throw new ApiError('forbidden', 'This runtime may not read this native session.');
  const parent = metadata.header.origin === 'subagent' ? metadata.header.parentSession : undefined;
  if (
    parent === undefined ||
    store.harnessSessions.grant(input.id)?.runtime_instance === input.runtime_instance
  )
    return input.id;
  return parent;
}

export const READER_SESSION_UNIT = storeUnit(readerSession);
