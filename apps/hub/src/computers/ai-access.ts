import {
  ApiError,
  COMPUTER_AI_READ,
  CLAUDE_OPERATION_ACCEPTED,
  type ComputerAiRead,
  type ComputerAiRequest,
  type ComputerAiStatus,
  type ComputerAiReply,
} from '@smarteverything/domain';

export function isRead(request: ComputerAiRequest): request is ComputerAiRead {
  return COMPUTER_AI_READ.safeParse(request).success;
}

export function assertEnabled(
  status: ComputerAiStatus,
  request: ComputerAiRequest,
  provider: boolean,
): void {
  if (request.operation === 'status' || request.operation === 'configure') return;
  const enabled = provider ? status.settings.provider.enabled : status.settings.control.enabled;
  if (!enabled)
    throw new ApiError(
      'claude_not_ready',
      `Claude ${provider ? 'provider' : 'control'} is disabled on this computer.`,
    );
}
export function assertOperation(
  status: ComputerAiStatus,
  request: ComputerAiRequest,
  provider: boolean,
): void {
  if (
    request.operation === 'status' ||
    request.operation === 'configure' ||
    status.capabilities.operations.some((operation) => operation === request.operation)
  )
    return;
  const reason = provider
    ? status.capabilities.provider_reason
    : status.capabilities.control_reason;
  throw new ApiError(
    'claude_not_ready',
    reason ?? 'This operation is unavailable on the selected computer.',
  );
}

export function assertReply(request: ComputerAiRequest, reply: ComputerAiReply): void {
  if (reply.operation !== request.operation)
    throw new ApiError(
      'upstream_failed',
      `The computer returned ${reply.operation} for ${request.operation}.`,
    );
  const operationId = 'operation_id' in request ? request.operation_id : undefined;
  const receiptId = replyReceiptId(reply);
  if (operationId !== undefined && receiptId !== null && operationId !== receiptId)
    throw new ApiError('upstream_failed', 'The computer returned a different native receipt.');
}

function replyReceiptId(reply: ComputerAiReply): string | null {
  if (reply.operation === 'native_operation') return reply.value.id;
  const accepted = CLAUDE_OPERATION_ACCEPTED.safeParse(reply.value);
  return accepted.success ? accepted.data.native_operation.id : null;
}
