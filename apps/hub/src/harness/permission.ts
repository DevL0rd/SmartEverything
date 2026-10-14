import { z } from 'zod';
import {
  ApiError,
  AI_HARNESS_PERMISSION_CHANGE,
  AI_HARNESS_SESSION,
} from '@smarteverything/domain';
import type {
  AiHarnessPermissionChange,
  AiHarnessSession,
  AiHarnessEvent,
  AiHarnessHost,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { HarnessService } from './service';
import type { ChatOwner } from '../assistant/chat-directory';
import { recoverPermission, durablePermission } from './permission-recovery';

export const PERMISSION_OPERATION = z.object({
  kind: z.literal('permission'),
  ...AI_HARNESS_PERMISSION_CHANGE.shape,
  native_from_seq: z.int().nonnegative(),
});

export async function changePermission(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
  input: AiHarnessPermissionChange,
): Promise<AiHarnessSession> {
  admitPermission(service, owner, chatId, input);
  recoverPermission(service, service.own(owner, chatId));
  const session = service.state(owner, chatId);
  const prior = service.store.harnessCoordination.operation(input.operation_id);
  const from =
    prior === undefined
      ? session.metadata.next_seq
      : PERMISSION_OPERATION.parse(JSON.parse(prior.request)).native_from_seq;
  const receipt = service.store.harnessCoordination.begin(input.operation_id, session.session_id, {
    kind: 'permission',
    ...input,
    native_from_seq: from,
  });
  if (receipt.state === 'completed') {
    if (receipt.result === null) throw new ApiError('conflict', 'Permission receipt is missing.');
    AI_HARNESS_SESSION.parse(JSON.parse(receipt.result));
    return service.state(owner, chatId);
  }
  if (JSON.stringify(session.permission) === JSON.stringify(input.permission)) {
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
  if (JSON.stringify(confirmed.permission) !== JSON.stringify(input.permission))
    throw new ApiError(
      'conflict',
      'Native policy was not durably confirmed. Retry this same operation.',
    );
  return confirmed;
}

function admitPermission(
  service: HarnessService,
  owner: ChatOwner,
  chatId: string,
  input: AiHarnessPermissionChange,
): AiHarnessSession {
  const session = service.state(owner, chatId);
  const host = service.directory.get(session.target).host;
  admitPolicyHost(owner, host, input);
  service.storage.grant(session.session_id);
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

function admitPolicyHost(
  owner: ChatOwner,
  host: AiHarnessHost,
  input: AiHarnessPermissionChange,
): void {
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
  if (
    !host.manifest.permissions.some(
      (policy) => JSON.stringify(policy) === JSON.stringify(input.permission),
    )
  )
    throw new ApiError(
      'conflict',
      'This host does not support the requested sandbox and approval policy.',
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
  const input = PERMISSION_OPERATION.parse(JSON.parse(receipt.request));
  if (
    input.expected_epoch !== event.epoch ||
    JSON.stringify(input.permission) !== JSON.stringify(event.session.permission)
  )
    throw new ApiError(
      'forbidden',
      'Native policy publication differs from its admitted operation.',
    );
  if (receipt.state === 'completed') return undefined;
  if (receipt.state !== 'pending')
    throw new ApiError('forbidden', 'Native policy operation has an unknown outcome.');
  const effective = durablePermission(
    service,
    service.store.aiChats.chat(event.chat_id),
    event.session,
    input.native_from_seq,
  );
  if (effective === null || JSON.stringify(effective) !== JSON.stringify(input.permission))
    throw new ApiError(
      'forbidden',
      'Native policy publication has no matching durable policy facts.',
    );
  return input;
}

export function confirmedPermissionRequest(
  service: HarnessService,
  request: Extract<HarnessRuntimeRequest, { kind: 'permission' }>,
): void {
  const pending = service.store.harnessCoordination.permissionChange(request.session_id);
  const receipt = service.store.harnessCoordination.operation(request.operation_id);
  const recorded =
    receipt === undefined ? undefined : PERMISSION_OPERATION.parse(JSON.parse(receipt.request));
  if (
    receipt?.session_id !== request.session_id ||
    recorded?.expected_epoch !== request.expected_epoch ||
    JSON.stringify(recorded.permission) !== JSON.stringify(request.permission) ||
    (receipt.state !== 'completed' && pending?.operation_id !== request.operation_id)
  )
    throw new ApiError(
      'forbidden',
      'Native permission control has no matching admitted operation.',
    );
}
