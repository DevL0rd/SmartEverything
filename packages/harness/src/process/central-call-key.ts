import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
export function centralCallKey(execution: Pick<ToolRunContext, 'agent' | 'callId'>): string {
  return `${execution.agent?.id ?? ''}:${execution.callId}`;
}
