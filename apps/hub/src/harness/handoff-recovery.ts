import { issueProjectGrant } from './project-grant';
import { randomUUID } from 'node:crypto';
import { ApiError, DSH_SESSION_ID } from '@smarteverything/domain';
import type { AiChatRow, AiHarnessHandoff } from '@smarteverything/domain';
import type { HarnessGrant } from '../store/repositories/harness-coordination';
import type { HarnessService } from './service';
import { prepareConversation } from './preparation';
export async function recoverFailedTarget(
  service: HarnessService,
  input: {
    readonly chat: AiChatRow;
    readonly grant: HarnessGrant;
    readonly handoff: AiHarnessHandoff;
  },
): Promise<void> {
  const metadata = service.store.dshSessions.stat(input.grant.session_id, input.grant.profile_id);
  const writer = service.store.dshSessions.writerState(
    input.grant.session_id,
    input.grant.profile_id,
  );
  if (metadata === undefined)
    throw new ApiError('conflict', 'Native recovery lost its authoritative history.');
  if (writer.state === 'active' && writer.claim !== null) {
    const receipt = await service.directory.execute(writer.claim.target, randomUUID(), {
      kind: 'close',
      session_id: DSH_SESSION_ID.parse(input.grant.session_id),
      expected_epoch: writer.claim.epoch,
      claim: writer.claim,
    });
    if (receipt.state !== 'closed')
      throw new ApiError(
        'conflict',
        'Failed target cleanup is unconfirmed; its writer cannot safely be reassigned.',
      );
  }
  const settled = service.store.dshSessions.writerState(
    input.grant.session_id,
    input.grant.profile_id,
  );
  if (settled.state === 'active')
    throw new ApiError('conflict', 'Failed target still owns a native writer after cleanup.');
  service.store.aiChats.update(input.chat.id, { engine: input.chat.engine });
  issueProjectGrant(service.store, input.grant);
  const open = prepareConversation(service, {
    owner: { profileId: input.grant.profile_id, role: input.grant.role },
    chatId: input.chat.id,
    authority: input.grant.authority,
    localClientId: input.grant.client_id ?? undefined,
    cwd: input.grant.cwd,
  });
  await service.directory.execute(open.claim.target, randomUUID(), open);
  service.store.harnessRecovery.openingOutcome(input.chat.id, 'ready');
}
