import { z } from 'zod';
import { AI_HARNESS_PERMISSION, ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessPermission,
  AiHarnessSession,
  AiHarnessPermissionChange,
} from '@smarteverything/domain';
import type { HarnessService } from './service';

export function recoverPermission(service: HarnessService, chat: AiChatRow): void {
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null) return;
  const pending = service.store.harnessCoordination.permissionChange(chat.engine.session_id);
  if (pending === null) return;
  service.storage.grant(chat.engine.session_id);
  const session = service.store.harnessCoordination.state(chat.engine.session_id);
  if (session === undefined) return;
  const policy = recoveryPolicy(service, chat, session, pending);
  if (policy === null) return;
  const metadata = service.store.dshSessions.stat(session.session_id, chat.profile_id);
  if (metadata === undefined)
    throw new ApiError('conflict', 'Native permission recovery lost its durable metadata.');
  const recovered = { ...session, metadata, permission: policy, permission_change: null };
  service.store.harnessCoordination.recoverPermission(recovered, pending, () => {
    const current = service.store.aiChats.chat(chat.id);
    service.store.aiChats.update(chat.id, {
      engine: { ...service.binding(current), permission: policy },
    });
  });
}

function recoveryPolicy(
  service: HarnessService,
  chat: AiChatRow,
  session: AiHarnessSession,
  pending: AiHarnessPermissionChange,
): AiHarnessPermission | null {
  const receipt = service.store.harnessCoordination.operation(pending.operation_id);
  if (receipt === undefined || session.epoch !== pending.expected_epoch) return null;
  if (
    service.store.dshSessions.writerState(session.session_id, chat.profile_id).claim?.epoch !==
    pending.expected_epoch
  )
    return null;
  const from = z
    .object({ native_from_seq: z.int().nonnegative() })
    .parse(JSON.parse(receipt.request)).native_from_seq;
  const policy = durablePermission(service, chat, session, from);
  return JSON.stringify(policy) === JSON.stringify(pending.permission) ? policy : null;
}

export function durablePermission(
  service: HarnessService,
  chat: AiChatRow,
  session: AiHarnessSession,
  from: number,
): AiHarnessPermission | null {
  let offset: number | null = 0;
  let sandbox: AiHarnessPermission['sandbox'] | undefined;
  let approval: AiHarnessPermission['approval'] | undefined;
  let lastChange = -1;
  while (offset !== null) {
    const page = service.store.dshSessions.read(
      { session_id: session.session_id, offset, limit: 10_000 },
      chat.profile_id,
    );
    for (const event of page.events) {
      if (event.seq > page.metadata.durable_seq) continue;
      if (event.type === 'sandbox/mode') {
        sandbox = z.object({ mode: AI_HARNESS_PERMISSION.shape.sandbox }).parse(event.data).mode;
        lastChange = Math.max(lastChange, event.seq);
      }
      if (event.type === 'approval/policy') {
        approval =
          z.object({ policy: z.enum(['ask', 'never']) }).parse(event.data).policy === 'ask'
            ? 'on-request'
            : 'never';
        lastChange = Math.max(lastChange, event.seq);
      }
    }
    offset = page.next_offset;
  }
  return lastChange >= from && sandbox !== undefined && approval !== undefined
    ? { sandbox, approval }
    : null;
}
