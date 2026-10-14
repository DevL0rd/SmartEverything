import { randomUUID } from 'node:crypto';
import { ApiError, DSH_SESSION_ID } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessAuthority } from '@smarteverything/harness';
import type { HarnessService } from './service';
import type { HarnessRuntimeRequest } from '@smarteverything/domain';
export async function openConversation(
  service: HarnessService,
  input: {
    readonly owner: ChatOwner;
    readonly chatId: string;
    readonly authority: HarnessAuthority;
    readonly clientId?: string;
  },
): Promise<Extract<HarnessRuntimeRequest, { kind: 'open' }>> {
  const request = service.prepare(input.owner, input.chatId, input.authority, input.clientId);
  return joinOpening(service, request, () => performOpen(service, input, request)).then(
    () => request,
  );
}
const pending = new WeakMap<
  HarnessService,
  Map<string, { readonly signature: string; readonly result: Promise<void> }>
>();
function joinOpening(
  service: HarnessService,
  request: Extract<HarnessRuntimeRequest, { kind: 'open' }>,
  open: () => Promise<void>,
): Promise<void> {
  const { expires_at: _expiresAt, ...claim } = request.claim;
  const signature = JSON.stringify({ ...request, claim });
  const openings =
    pending.get(service) ??
    new Map<string, { readonly signature: string; readonly result: Promise<void> }>();
  pending.set(service, openings);
  const previous = openings.get(request.chat_id);
  if (previous !== undefined) {
    if (previous.signature !== signature)
      throw new ApiError('conflict', 'Competing open changed the admitted conversation request.');
    return previous.result;
  }
  const result = Promise.resolve()
    .then(open)
    .finally(() => {
      openings.delete(request.chat_id);
    });
  openings.set(request.chat_id, { signature, result });
  return result;
}
async function performOpen(
  service: HarnessService,
  input: Parameters<typeof openConversation>[1],
  request: Extract<HarnessRuntimeRequest, { kind: 'open' }>,
): Promise<void> {
  try {
    await service.directory.execute(request.claim.target, randomUUID(), request);
    service.store.harnessRecovery.openingOutcome(input.chatId, 'ready');
    return;
  } catch (cause) {
    service.store.harnessRecovery.openingOutcome(
      input.chatId,
      'failed',
      cause instanceof Error ? cause.message : 'Native open failed.',
    );
    const writer = service.store.dshSessions.writerState(
      request.claim.session_id,
      input.owner.profileId,
    );
    if (writer.state === 'active' && writer.claim?.epoch === request.claim.epoch) {
      const cleanup = await service.directory.execute(request.claim.target, randomUUID(), {
        kind: 'close',
        session_id: DSH_SESSION_ID.parse(request.claim.session_id),
        expected_epoch: request.claim.epoch,
        claim: request.claim,
      });
      if (
        cleanup.state !== 'closed' ||
        service.store.dshSessions.writerState(request.claim.session_id, input.owner.profileId)
          .state === 'active'
      )
        throw new ApiError(
          'conflict',
          'Failed open cleanup is unconfirmed; its writer cannot safely be reassigned.',
        );
    }
    throw cause;
  }
}
