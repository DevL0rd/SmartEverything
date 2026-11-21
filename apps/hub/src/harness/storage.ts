import { resumeHelperWriter } from './helper-writer-renewal';
import { ApiError, DSH_SESSION_HEADER } from '@smarteverything/domain';
import type {
  DshSessionOpened,
  DshWriterClaim,
  HarnessTransportRequest,
  HarnessSubscriptionUse,
} from '@smarteverything/domain';
import { adoptSubagentSession } from '../assistant/engines/dsh/children-adoption';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import { DshSessionStorageError } from '../store/repositories/dsh-session-errors';
import type { Store } from '../store/store';
import type { HarnessGrant } from './grant';
import type { HarnessDirectory } from './directory';
import type { CheckedWriter } from './grant-check';

type HarnessBinding = Pick<
  HarnessTransportRequest,
  'device_id' | 'generation' | 'runtime_instance'
>;

export class HarnessStorage {
  constructor(
    private readonly store: Store,
    private readonly directory: HarnessDirectory,
  ) {}
  grant(id: string): Promise<HarnessGrant> {
    return this.store.host.read('harnessGrant', id);
  }
  reader(id: string, runtimeInstance: string): Promise<string> {
    return this.store.host.read('harnessReader', { id, runtime_instance: runtimeInstance });
  }
  async principal(id: string, binding: HarnessBinding): Promise<DshSessionPrincipal> {
    return (await this.checked(id, binding)).principal;
  }
  checked(
    id: string,
    binding: HarnessBinding,
    claim?: DshWriterClaim,
    subscription?: HarnessSubscriptionUse,
  ): Promise<CheckedWriter> {
    const host = this.directory.bound(
      binding.device_id,
      binding.generation,
      binding.runtime_instance,
    ).host;
    return this.store.host.read('harnessWriter', {
      id,
      host: { target: host.target, platform: host.platform },
      runtime_instance: binding.runtime_instance,
      connection_generation: binding.generation,
      ...(claim === undefined ? {} : { claim }),
      ...(subscription === undefined ? {} : { subscription }),
    });
  }
  async execute(input: HarnessTransportRequest): Promise<unknown> {
    const request = input.request;
    if (request.operation === 'stat' || request.operation === 'read') {
      const id = request.operation === 'stat' ? request.session_id : request.input.session_id;
      const principal = await this.principal(await this.reader(id, input.runtime_instance), input);
      return request.operation === 'stat'
        ? this.store.host.call('dshSessions', 'stat', id, principal.profile_id)
        : this.store.host.call('dshSessions', 'read', request.input, principal.profile_id);
    }
    if (request.operation === 'verify')
      return this.verify(request.claim, input, request.subscription);
    if (request.operation === 'append' || request.operation === 'flush')
      return writtenOrFenced(() => this.write(input, request));
    if (request.operation === 'resume_child')
      return writtenOrFenced(async () => {
        const parent = await this.checked(
          request.parent_claim.session_id,
          input,
          request.parent_claim,
        );
        return resumeHelperWriter(this.store, {
          id: request.session_id,
          parent: verifiedOf(parent),
          principal: parent.principal,
          grant: await this.grant(request.session_id),
        });
      });
    if (request.operation === 'create_child')
      return writtenOrFenced(async () => {
        const parent = await this.checked(
          request.parent_claim.session_id,
          input,
          request.parent_claim,
        );
        return this.adoptChild(
          request.header,
          request.inherited_event_count,
          parent.principal,
          verifiedOf(parent),
        );
      });
    throw new ApiError('invalid_request', 'This operation is not native persistence.');
  }
  async adoptChild(
    header: unknown,
    inherited: number,
    principal: DshSessionPrincipal,
    parentClaim: DshWriterClaim,
  ): Promise<DshSessionOpened> {
    const native = DSH_SESSION_HEADER.parse(header);
    if (native.origin !== 'subagent' || native.parentSession !== parentClaim.session_id)
      throw new ApiError(
        'forbidden',
        'A helper session must name the conversation that is starting it as its parent.',
      );
    const adopted = await adoptSubagentSession(this.store, {
      principal,
      parentClaim,
      parentGrant: await this.grant(parentClaim.session_id),
      header: native,
      inherited,
      now: new Date().toISOString(),
    });
    return adopted.opened;
  }
  private async write(
    input: HarnessTransportRequest,
    request: Extract<HarnessTransportRequest['request'], { operation: 'append' | 'flush' }>,
  ): Promise<unknown> {
    const principal = await this.principal(request.input.claim.session_id, input);
    if (request.operation === 'append')
      return this.store.live.dshSessions.append(request.input, principal);
    return this.store.host.call('dshSessions', 'flush', request.input, principal);
  }
  async verify(
    claim: DshWriterClaim,
    binding: HarnessBinding,
    subscription?: HarnessSubscriptionUse,
  ): Promise<DshWriterClaim> {
    return verifiedOf(await this.checked(claim.session_id, binding, claim, subscription));
  }
}

function verifiedOf(checked: CheckedWriter): DshWriterClaim {
  if (checked.claim === null)
    throw new ApiError('ownership_lost', 'The native writer claim was not verified.');
  return checked.claim;
}

async function writtenOrFenced<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (!(error instanceof DshSessionStorageError)) throw error;
    throw new ApiError(
      error.code === 'ownership-lost' ? 'ownership_lost' : 'conflict',
      error.message,
    );
  }
}
