import { randomUUID } from 'node:crypto';
import { retiredWriter } from './retired-writer';
import { ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessSession,
  DshWriterClaim,
  HarnessRuntimeReceipt,
} from '@smarteverything/domain';
import type { ChatOwner } from '../../chat-directory';
import type { HarnessService } from '../../../harness/service';

export async function closeNativeHistory(
  service: HarnessService,
  chat: AiChatRow,
  owner: ChatOwner,
  active: boolean,
): Promise<void> {
  service.own(owner, chat.id);
  const id = service.binding(chat).session_id;
  if (id === null) return;
  const writer = service.store.dshSessions.writerState(id, owner.profileId);
  if (writer.state === 'released') return;
  const claim = writer.claim;
  if (claim === null)
    throw new ApiError('conflict', 'Native history has no writer identity to close safely.');
  const connection = service.directory.get(claim.target);
  const session = service.state(owner, chat.id);
  requireSettledHandoff(session);
  const grant = service.storage.grant(id);
  service.admitTarget(owner, connection.host, connection.actor.id, grant.client_id ?? undefined);
  if (retiredWriter(connection, claim, active)) return;
  service.store.dshSessions.verifyWriter(
    claim,
    service.hostPrincipal(owner.profileId, connection.host),
  );
  if (active || session.state === 'working' || session.state === 'waiting')
    await service.directory.execute(claim.target, randomUUID(), {
      kind: 'interrupt',
      session_id: id,
      expected_epoch: claim.epoch,
    });
  const closed = await service.directory.execute(claim.target, randomUUID(), {
    kind: 'close',
    session_id: id,
    expected_epoch: claim.epoch,
    claim,
  });
  requireClosed(service, owner, claim, closed);
}
function requireClosed(
  service: HarnessService,
  owner: ChatOwner,
  claim: DshWriterClaim,
  closed: HarnessRuntimeReceipt,
): void {
  if (
    closed.state !== 'closed' ||
    closed.epoch !== claim.epoch ||
    closed.session_id !== claim.session_id ||
    service.store.dshSessions.writerState(claim.session_id, owner.profileId).state !== 'released'
  )
    throw new ApiError(
      'conflict',
      'Native close did not confirm disposal and durable writer release; history was retained.',
    );
}

function requireSettledHandoff(session: AiHarnessSession): void {
  const handoff = session.handoff;
  if (handoff !== null && handoff.stage !== 'completed' && handoff.stage !== 'failed')
    throw new ApiError('conflict', 'Finish the admitted host switch before deleting this history.');
}
