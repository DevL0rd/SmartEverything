import type { CodexAiExecute, AiNativeCommandDispatch } from '@smarteverything/domain';
export function commandDispatchDecision(
  request: Extract<CodexAiExecute, { operation: 'provider_command_dispatch' }>,
): AiNativeCommandDispatch {
  return {
    scope: request.scope,
    operation_id: request.operation_id,
    permit: request.permit,
    reason: request.reason,
  };
}
