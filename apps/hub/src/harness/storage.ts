import { storedProjectBinding } from './project-grant';
import { eventAuthority, executionRole } from '../assistant/execution-authority';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type {
  DshWriterClaim,
  HarnessTransportRequest,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
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
    this.admitGrant(grant, id);
    const chat = this.store.aiChats.chat(
      this.store.dshSessions.stat(id, grant.profile_id)?.chat_id ?? '',
    );
    if (
      chat.profile_id !== grant.profile_id ||
      chat.engine.kind !== 'dsh' ||
      chat.engine.session_id !== id
    )
      throw new ApiError('forbidden', 'The conversation no longer authorizes this native session.');
    const storage_binding = storedProjectBinding(this.store, id);
    return { ...grant, ...(storage_binding === undefined ? {} : { storage_binding }) };
  }
  private admitGrant(grant: HarnessGrant, id: string): void {
    let role = grant.role;
    if (grant.client_id !== null && this.store.clients.byId(grant.client_id).role !== 'owner')
      role = 'member';
    if (
      grant.client_id !== null &&
      this.store.profiles.activeOf(this.store.clients.byId(grant.client_id).id).id !==
        grant.profile_id
    ) {
      this.store.harnessCoordination.revoke(id);
      throw new ApiError('forbidden', 'The initiating profile execution grant was revoked.');
    }
    if (grant.event_id !== null) {
      const authority = eventAuthority(
        this.store,
        this.store.assistantEvents.event(grant.event_id),
      );
      if (executionRole(this.store, authority) !== 'owner') role = 'member';
      if (authority.profile_id !== grant.profile_id)
        throw new ApiError('forbidden', 'Initiating event grant belongs to another profile.');
    } else if (grant.client_id === null)
      throw new ApiError(
        'forbidden',
        'Native access needs an issued client or service-event authority.',
      );
    this.admitComputer(grant, role);
  }
  private admitComputer(grant: HarnessGrant, role: HarnessGrant['role']): void {
    if (
      grant.target.kind === 'device' &&
      this.store.devices.byId(grant.target.device_id).kind === 'computer' &&
      role !== 'owner'
    )
      throw new ApiError(
        'forbidden',
        'The initiating authority no longer authorizes computer execution.',
      );
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
      grant.runtime_instance !== binding.runtime_instance ||
      host.manifest === null
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
      conversation_authorized: true,
      platform: host.platform,
      composition: host.manifest.composition,
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
    if (
      request.operation === 'append' ||
      request.operation === 'flush' ||
      request.operation === 'release' ||
      request.operation === 'renew'
    )
      return this.write(input, request);
    throw new ApiError('invalid_request', 'This operation is not native persistence.');
  }
  private write(
    input: HarnessTransportRequest,
    request: Extract<
      HarnessTransportRequest['request'],
      { operation: 'append' | 'flush' | 'release' | 'renew' }
    >,
  ): unknown {
    switch (request.operation) {
      case 'append':
        return this.store.dshSessions.append(
          request.input,
          this.principal(request.input.claim.session_id, input),
        );
      case 'flush':
        return this.store.dshSessions.flush(
          request.input,
          this.principal(request.input.claim.session_id, input),
        );
      case 'release':
        return this.store.dshSessions.release(
          request.input,
          this.principal(request.input.claim.session_id, input),
        );
      case 'renew':
        return this.store.dshSessions.renew(
          request.input,
          this.principal(request.input.claim.session_id, input),
        );
    }
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
    const principal = this.principal(claim.session_id, binding);
    if (subscription !== undefined) this.admitSubscription(claim.session_id, subscription);
    return this.store.dshSessions.verifyWriter(claim, principal);
  }
}
