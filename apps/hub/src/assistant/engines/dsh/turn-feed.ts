import { toolSummary } from '@smarteverything/harness/process';
import type { ProjectedOp, ProjectedTool } from '@smarteverything/harness/process';
import {
  CHAT_RETRYING_REASON,
  CHAT_WAITING_HELPERS_REASON,
  CHAT_WAITING_JOBS_REASON,
  type AiHarnessSession,
  type ChatToolItem,
} from '@smarteverything/domain';
import type { TurnStream } from '../../conversation/stream';

export interface FedTool extends Omit<ProjectedTool, 'state'> {
  readonly state: ProjectedTool['state'] | 'unknown';
}

const TOOL_STATE: Record<FedTool['state'], ChatToolItem['state']> = {
  running: 'running',
  completed: 'done',
  failed: 'failed',
  unknown: 'failed',
};

export function feedTool(stream: TurnStream, tool: FedTool): void {
  stream.tool(
    {
      callId: tool.callId,
      name: tool.name,
      title: tool.name,
      state: TOOL_STATE[tool.state],
      detail: toolSummary(tool.detail, 400),
    },
    {
      input: tool.input,
      output: tool.output,
      ...(tool.state === 'unknown' ? { state: 'unknown' as const } : {}),
    },
  );
}

export function feedOp(stream: TurnStream, op: ProjectedOp): void {
  if (op.op === 'tool') feedTool(stream, op.tool);
  else if (op.op === 'text') stream.text(op.text);
  else stream.reasoning(op.text);
}

function waitReason(session: AiHarnessSession): string | null {
  if (session.state !== 'waiting') return null;
  if (session.work.some((item) => item.kind === 'child')) return CHAT_WAITING_HELPERS_REASON;
  return session.work.some((item) => item.kind === 'shell') ? CHAT_WAITING_JOBS_REASON : null;
}

const SESSION_REASONS: ReadonlySet<string> = new Set([
  CHAT_WAITING_HELPERS_REASON,
  CHAT_WAITING_JOBS_REASON,
]);

export function followSession(stream: TurnStream, session: AiHarnessSession): void {
  if (session.reconnecting === true) {
    stream.retrying();
    return;
  }
  const current = stream.current();
  const reason = waitReason(session);
  if (reason !== null) {
    if (current.reason !== reason) stream.snapshot('thinking', null, reason);
    return;
  }
  const settled =
    current.reason !== null &&
    (SESSION_REASONS.has(current.reason) ||
      (session.reconnecting === false && current.reason === CHAT_RETRYING_REASON));
  if (current.state === 'thinking' && settled) stream.snapshot('thinking', null, null);
  else if (!settled) stream.snapshot(current.state, null, current.reason);
}
