import type { AiHarnessFailure } from '@smarteverything/domain';
import type { NativeBody } from './event';
import { nativeToolOutput, nativeToolText, toolSummary } from '../process/tool-result-output';

type TurnEnd = Extract<NativeBody, { type: 'turn/end' }>['data'];
type ToolResult = Extract<NativeBody, { type: 'tool/result' }>['data'];

function turnFailureMessage(reason: TurnEnd['reason']): string {
  const error = reason.kind === 'error' ? reason.error : undefined;
  const message = error?.message ?? '';
  const code = error?.['code'];
  const named = typeof code === 'string' && code !== '' ? `${code}: ` : '';
  if (message !== '') return `${named}${message}`;
  return reason.kind === 'blocked' ? 'The turn was blocked.' : 'The turn failed.';
}

const PROVIDER_FAILURES: ReadonlyMap<string, AiHarnessFailure['code']> = new Map<
  string,
  AiHarnessFailure['code']
>([
  ['AUTH', 'route_unavailable'],
  ['MISSING_CREDENTIAL', 'route_unavailable'],
  ['INVALID_CREDENTIAL', 'route_unavailable'],
  ['ROUTE_UNAVAILABLE', 'route_unavailable'],
  ['QUOTA', 'quota_exhausted'],
  ['ACCOUNT_QUOTA', 'quota_exhausted'],
]);

function turnFailureCode(reason: TurnEnd['reason']): AiHarnessFailure['code'] {
  const code = reason.kind === 'error' ? reason.error?.['code'] : undefined;
  if (typeof code !== 'string') return 'operation_failed';
  return PROVIDER_FAILURES.get(code) ?? 'operation_failed';
}

export function turnEndBody(
  data: TurnEnd,
  seq: number,
  durableSeq: number,
): Record<string, unknown> {
  const reason = data.reason;
  if (reason.kind === 'blocked' || reason.kind === 'error')
    return {
      kind: 'failed',
      failure: {
        code: turnFailureCode(reason),
        message: turnFailureMessage(reason),
        retry_at: null,
      },
    };
  return {
    kind: 'completed',
    interrupted: reason.kind === 'aborted' || reason.kind === 'interrupted',
    durable_seq: Math.min(durableSeq, seq),
  };
}

export function toolResultBody(name: string, result: ToolResult): Record<string, unknown> {
  const message = result.message;
  return {
    call_id: message.toolCallId,
    name,
    state: message.isError === true ? 'failed' : 'completed',
    detail: toolSummary(nativeToolText(message.content), 16_000),
    output: nativeToolOutput(result),
  };
}
