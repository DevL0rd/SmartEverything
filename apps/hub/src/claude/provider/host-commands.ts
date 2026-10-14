import type { ComputerAiExecute, ComputerAiReply } from '@smarteverything/domain';
import type { ClaudeProviderRuntime } from './runtime';
type CommandExecute = Extract<
  ComputerAiExecute,
  { operation: 'provider_command' | 'provider_command_dispatch' }
>;
export function isProviderCommand(request: ComputerAiExecute): request is CommandExecute {
  return (
    request.operation === 'provider_command' || request.operation === 'provider_command_dispatch'
  );
}
export async function executeProviderCommand(
  provider: ClaudeProviderRuntime,
  request: CommandExecute,
): Promise<ComputerAiReply> {
  if (request.operation === 'provider_command_dispatch')
    return {
      operation: request.operation,
      value: await provider.commandDispatch({
        scope: request.scope,
        operation_id: request.operation_id,
        permit: request.permit,
        reason: request.reason,
      }),
    };
  return {
    operation: request.operation,
    value: await provider.command({
      scope: request.scope,
      operation_id: request.operation_id,
      command_job_id: request.command_job_id,
      definition_id: request.definition_id,
      arguments: request.arguments,
      attachments: request.attachments,
    }),
  };
}
