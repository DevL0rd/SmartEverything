import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { ApiError, AI_HARNESS_PERMISSION_CHANGE } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessPermissionChange,
  AiHarnessSession,
  AiHarnessEvent,
  AiHarnessHost,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { HarnessService } from './service';
import type { ChatOwner } from '../assistant/chat-directory';

const PERMISSION_OPERATION = z.object({
  kind: z.literal('permission'),
  ...AI_HARNESS_PERMISSION_CHANGE.shape,
});

export async function changePermission(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
  input: AiHarnessPermissionChange,
): Promise<AiHarnessSession> {
  const session = admitPermission(service, owner, chatId, input);
  const prior = service.store.harnessCoordination.operation(input.operation_id);
  const request: unknown =
    prior === undefined ? { kind: 'permission', ...input } : JSON.parse(prior.request);
  const receipt = service.store.harnessCoordination.begin(
    input.operation_id,
    session.session_id,
    request,
  );
  if (receipt.state === 'completed') return service.state(owner, chatId);
  if (isDeepStrictEqual(session.permission, input.permission)) {
    service.store.harnessCoordination.finish(input.operation_id, session);
    return service.state(owner, chatId);
  }
  await service.directory.execute(session.target, input.operation_id, {
    kind: 'permission',
    operation_id: input.operation_id,
    session_id: session.session_id,
    expected_epoch: input.expected_epoch,
    permission: input.permission,
  });
  const confirmed = service.state(owner, chatId);
  return isDeepStrictEqual(confirmed.permission, input.permission)
    ? confirmed
    : settlePermission(service, owner, chatId, input);
}

export function ownSettled(service: HarnessService, owner: ChatOwner, chatId: string): AiChatRow {
  const chat = service.own(owner, chatId);
  const sessionId = chat.engine.kind === 'dsh' ? chat.engine.session_id : null;
  const pending =
    sessionId === null ? null : service.store.harnessCoordination.permissionChange(sessionId);
  if (pending === null) return chat;
  settlePermission(service, owner, chatId, pending);
  return service.own(owner, chatId);
}

function settlePermission(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
  input: AiHarnessPermissionChange,
): AiHarnessSession {
  const session = service.state(owner, chatId);
  service.store.harnessCoordination.recoverPermission(
    { ...session, permission: input.permission, permission_change: null },
    input,
    () => {
      const chat = service.store.aiChats.chat(chatId);
      service.store.aiChats.update(chat.id, {
        engine: { ...service.binding(chat), permission: input.permission },
      });
    },
  );
  return service.state(owner, chatId);
}

function admitPermission(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
  input: AiHarnessPermissionChange,
): AiHarnessSession {
  const session = service.state(owner, chatId);
  admitPolicyHost(owner, service.directory.get(session.target).host);
  if (session.epoch !== input.expected_epoch || session.state === 'switching')
    throw new ApiError(
      'conflict',
      'Permission changes require the current stable native writer epoch.',
    );
  const pending = service.store.harnessCoordination.permissionChange(session.session_id);
  if (pending?.operation_id !== undefined && pending.operation_id !== input.operation_id)
    throw new ApiError(
      'conflict',
      'A permission change is still unconfirmed. Retry its existing operation first.',
    );
  return session;
}

function admitPolicyHost(owner: ChatOwner, host: AiHarnessHost): void {
  if (host.target.kind === 'device' && owner.role !== 'owner')
    throw new ApiError(
      'forbidden',
      'Only an authorized owner may change computer execution policy.',
    );
  if (host.manifest?.permission_change !== true)
    throw new ApiError(
      'conflict',
      'Update this execution host before changing an existing session’s permissions.',
    );
}

export function confirmedPermission(
  service: HarnessService,
  event: Extract<AiHarnessEvent, { kind: 'state' }>,
): AiHarnessPermissionChange | undefined {
  const operationId = event.permission_operation_id;
  if (operationId === undefined) return undefined;
  const receipt = service.store.harnessCoordination.operation(operationId);
  if (receipt?.session_id !== event.session_id)
    throw new ApiError(
      'forbidden',
      'Native policy publication has no admitted permission operation.',
    );
  if (receipt.state === 'completed') return undefined;
  const input = PERMISSION_OPERATION.parse(JSON.parse(receipt.request));
  if (
    receipt.state !== 'pending' ||
    input.expected_epoch !== event.epoch ||
    !isDeepStrictEqual(input.permission, event.session.permission)
  )
    throw new ApiError(
      'forbidden',
      'Native policy publication differs from its admitted operation.',
    );
  return input;
}

export function confirmedPermissionRequest(
  service: HarnessService,
  request: Extract<HarnessRuntimeRequest, { kind: 'permission' }>,
): void {
  const receipt = service.store.harnessCoordination.operation(request.operation_id);
  if (receipt?.session_id !== request.session_id)
    throw new ApiError(
      'forbidden',
      'Native permission control has no matching admitted operation.',
    );
}
