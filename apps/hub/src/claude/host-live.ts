import type { ComputerAiExecute, ComputerAiReply } from '@smarteverything/domain';
import type { ClaudeProviderRuntime } from './provider/runtime';

export type LiveRequest = Extract<
  ComputerAiExecute,
  {
    operation:
      | 'provider_interrupt'
      | 'provider_steer'
      | 'provider_adopt'
      | 'provider_answer'
      | 'provider_tool_result';
  }
>;

const LIVE_OPERATIONS: ReadonlySet<string> = new Set([
  'provider_interrupt',
  'provider_steer',
  'provider_adopt',
  'provider_answer',
  'provider_tool_result',
]);

export function isLiveRequest(request: ComputerAiExecute): request is LiveRequest {
  return LIVE_OPERATIONS.has(request.operation);
}

export async function executeLive(
  provider: ClaudeProviderRuntime,
  request: LiveRequest,
): Promise<ComputerAiReply> {
  switch (request.operation) {
    case 'provider_interrupt':
      return {
        operation: request.operation,
        value: { interrupted: await provider.interrupt(request.job_id) },
      };
    case 'provider_steer':
      return {
        operation: request.operation,
        value: { steered: provider.steer(request.job_id, request.content) },
      };
    case 'provider_adopt':
      return {
        operation: request.operation,
        value: { session_id: await provider.adopt(request) },
      };
    case 'provider_answer':
      return {
        operation: request.operation,
        value: { answered: provider.answer(request.job_id, request.prompt_id, request.answer) },
      };
    case 'provider_tool_result':
      return {
        operation: request.operation,
        value: {
          delivered: provider.toolResult(request.job_id, request.call_id, {
            text: request.text,
            failed: request.failed,
            ...(request.content === undefined ? {} : { content: request.content }),
          }),
        },
      };
  }
}
