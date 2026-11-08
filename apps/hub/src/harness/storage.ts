import { ApiError, DSH_SESSION_HEADER, harnessTargetKey } from '@smarteverything/domain';
import type {
  DshSessionOpened,
  DshWriterClaim,
  HarnessTransportRequest,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import { ConversationLog } from '../assistant/conversation-log';
import { adoptSubagentSession } from '../assistant/engines/dsh/children';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import { DshSessionStorageError } from '../store/repositories/dsh-session-errors';
import type { Store } from '../store/store';
import type { HarnessGrant } from './grant';
import type { HarnessDirectory } from './directory';

export class HarnessStorage {
  constructor(
    private readonly store: Store,
    private readonly directory: HarnessDirectory,
  ) {}
  grant(id: string): HarnessGrant {
    const grant = this.store.harnessSessions.grant(id);
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
  reader(id: string, runtimeInstance: string): string {
    const metadata = this.store.dshSessions.ownerOf(id);
    if (metadata === undefined)
      throw new ApiError('not_found', 'This native session is not stored.');
    const parent =
      metadata.header.origin === 'subagent' ? metadata.header.parentSession : undefined;
    if (
      parent === undefined ||
      this.store.harnessSessions.grant(id)?.runtime_instance === runtimeInstance
    )
      return id;
    return parent;
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
    if (harnessTargetKey(grant.target) !== harnessTargetKey(host.target))
      throw new ApiError(
        'forbidden',
        'This runtime is not the granted conversation execution host.',
      );
    return {
      profile_id: grant.profile_id,
      target: grant.target,
      runtime_instance: binding.runtime_instance,
      connection_generation: binding.generation,
      platform: host.platform,
    };
  }
  execute(input: HarnessTransportRequest): unknown {
    const request = input.request;
    if (request.operation === 'stat' || request.operation === 'read') {
      const id = request.operation === 'stat' ? request.session_id : request.input.session_id;
      const principal = this.principal(this.reader(id, input.runtime_instance), input);
      return request.operation === 'stat'
        ? this.store.dshSessions.stat(id, principal.profile_id)
        : this.store.dshSessions.read(request.input, principal.profile_id);
    }
    if (request.operation === 'verify')
      return this.verify(request.claim, input, request.subscription);
    if (request.operation === 'append' || request.operation === 'flush')
      return writtenOrFenced(() => this.write(input, request));
    if (request.operation === 'create_child')
      return writtenOrFenced(() => {
        const parentClaim = this.verify(request.parent_claim, input);
        return this.adoptChild(
          request.header,
          request.inherited_event_count,
          this.principal(parentClaim.session_id, input),
          parentClaim,
        );
      });
    throw new ApiError('invalid_request', 'This operation is not native persistence.');
  }
  adoptChild(
    header: unknown,
    inherited: number,
    principal: DshSessionPrincipal,
    parentClaim: DshWriterClaim,
  ): DshSessionOpened {
    const native = DSH_SESSION_HEADER.parse(header);
    if (native.origin !== 'subagent' || native.parentSession !== parentClaim.session_id)
      throw new ApiError(
        'forbidden',
        'A helper session must name the conversation that is starting it as its parent.',
      );
    return adoptSubagentSession(this.store, new ConversationLog(this.store), {
      principal,
      parentClaim,
      parentGrant: this.grant(parentClaim.session_id),
      header: native,
      inherited,
      now: new Date().toISOString(),
    }).opened;
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
    if (selection.route_id !== input.route_id || selection.model !== input.model)
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
