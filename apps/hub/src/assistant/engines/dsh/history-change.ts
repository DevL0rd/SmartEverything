import { randomUUID } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import type { AiChatRow } from '@smarteverything/domain';
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
  const claim = service.store.dshSessions.attached(id, owner.profileId);
  if (claim === null || !service.directory.holds(claim.target, id, claim.epoch)) return;
  const session = service.state(owner, chat.id);
  if (session.state === 'switching')
    throw new ApiError('conflict', 'Finish the machine change before changing this history.');
  const control = { session_id: id, expected_epoch: claim.epoch };
  if (active || session.state === 'working' || session.state === 'waiting')
    await service.directory.execute(claim.target, randomUUID(), { kind: 'interrupt', ...control });
  const closed = await service.directory.execute(claim.target, randomUUID(), {
    kind: 'close',
    ...control,
  });
  if (closed.state !== 'closed')
    throw new ApiError(
      'conflict',
      'The machine did not confirm it had stopped; history was retained.',
    );
}
