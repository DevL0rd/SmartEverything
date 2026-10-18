import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  DshWriterClaim,
  HarnessTransportRequest,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import { DshSessionStorageError } from '../store/repositories/dsh-session-errors';
import type { Store } from '../store/store';
import type { HarnessGrant } from '../store/repositories/harness-coordination';
import type { HarnessDirectory } from './directory';

export class HarnessStorage {
  constructor(
    private readonly store: Store,
    private readonly directory: HarnessDirectory,
  ) {}
  grant(id: string): HarnessGrant {
    const grant = this.store.harnessCoordination.grant(id);
    if (grant === undefined)
      throw new ApiError(
        'forbidden',
        'This native session has no active conversation execution grant.',
      );
    const metadata = this.store.dshSessions.stat(id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('forbidden', 'This native session has no stored conversation.');
    const chat = this.store.aiChats.chat(metadata.chat_id);
    if (
      chat.profile_id !== grant.profile_id ||
      chat.engine.kind !== 'dsh' ||
      chat.engine.session_id !== id
    )
      throw new ApiError('forbidden', 'The conversation no longer authorizes this native session.');
    return grant;
  }
  principal(
    id: string,
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
  ): DshSessionPrincipal {
    const grant = this.grant(id);
    const connection = this.directory.bound(
      binding.device_id,
      binding.generation,
      binding.runtime_instance,
    );
    const host = connection.host;
    if (
      harnessTargetKey(grant.target) !== harnessTargetKey(host.target) ||
      grant.generation !== binding.generation ||
      grant.runtime_instance !== binding.runtime_instance
    )
      throw new ApiError(
        'forbidden',
        'This runtime is not the granted conversation execution host.',
      );
    return {
      profile_id: grant.profile_id,
      target: grant.target,
      runtime_instance: grant.runtime_instance,
      connection_generation: grant.generation,
      platform: host.platform,
    };
  }
  execute(input: HarnessTransportRequest): unknown {
    const request = input.request;
    if (request.operation === 'stat' || request.operation === 'read') {
      const id = request.operation === 'stat' ? request.session_id : request.input.session_id;
      const principal = this.principal(id, input);
      return request.operation === 'stat'
        ? this.store.dshSessions.stat(id, principal.profile_id)
        : this.store.dshSessions.read(request.input, principal.profile_id);
    }
    if (request.operation === 'verify')
      return this.verify(request.claim, input, request.subscription);
    if (request.operation === 'append' || request.operation === 'flush')
      return writtenOrFenced(() => this.write(input, request));
    throw new ApiError('invalid_request', 'This operation is not native persistence.');
  }
  private write(
    input: HarnessTransportRequest,
    request: Extract<HarnessTransportRequest['request'], { operation: 'append' | 'flush' }>,
  ): unknown {
    if (request.operation === 'append')
      return this.store.dshSessions.append(
        request.input,
        this.principal(request.input.claim.session_id, input),
      );
    return this.store.dshSessions.flush(
      request.input,
      this.principal(request.input.claim.session_id, input),
    );
  }
  private admitSubscription(id: string, input: HarnessSubscriptionUse): void {
    const selection = this.grant(id).route;
    if (
      selection.route_id !== input.route_id ||
      selection.capability_revision !== input.capability_revision ||
      selection.model !== input.model ||
      selection.credential_generation !== input.credential_generation
    )
      throw new ApiError(
        'forbidden',
        'Subscription inference differs from this session’s selected route, model or account revision. Select and reopen the route explicitly.',
      );
  }
  verify(
    claim: DshWriterClaim,
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
    subscription?: HarnessSubscriptionUse,
  ): DshWriterClaim {
    if (subscription !== undefined) this.admitSubscription(claim.session_id, subscription);
    const principal = this.principal(claim.session_id, binding);
    try {
      return this.store.dshSessions.verifyWriter(claim, principal);
    } catch (error) {
      if (error instanceof ApiError) throw new ApiError('ownership_lost', error.message);
      throw error;
    }
  }
}

function writtenOrFenced<T>(write: () => T): T {
  try {
    return write();
  } catch (error) {
    if (!(error instanceof DshSessionStorageError)) throw error;
    throw new ApiError(
      error.code === 'ownership-lost' ? 'ownership_lost' : 'conflict',
      error.message,
    );
  }
}
