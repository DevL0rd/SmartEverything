import { nativeInputId } from './helper-input';
import { observeModelRequestContext } from './model-request-context';
import { observeCompactionContext } from './compaction-context';
import { observeSessionTrace } from './session-trace';
import { addAbortListener } from 'node:events';
import { createHash } from 'node:crypto';
import { HarnessRuntimeError } from './errors';
import type { Context } from '@deepseek-ai/cordis';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import { Logger, background, describeFailure } from '@smarteverything/logging';
import type { FailureDetail } from '@smarteverything/logging';

export type HarnessRuntimeEvent =
  | { readonly kind: 'session'; readonly sessionId: string; readonly event: SessionEvent }
  | {
      readonly kind: 'input';
      readonly sessionId: string;
      readonly messageId: string;
      readonly turn: number;
    }
  | { readonly kind: 'discarded'; readonly sessionId: string; readonly messageId: string }
  | { readonly kind: 'stream'; readonly sessionId: string; readonly frame: AssistantStreamFrame }
  | { readonly kind: 'status'; readonly sessionId: string; readonly status: 'idle' | 'running' }
  | { readonly kind: 'commands'; readonly sessionId: string; readonly revision: string }
  | { readonly kind: 'context'; readonly sessionId: string; readonly estimate: number | null }
  | { readonly kind: 'error'; readonly sessionId: string; readonly failure: FailureDetail };

export interface HarnessFailureInput {
  readonly sessionId: string;
  readonly turn: number;
  readonly publicationFailed?: true;
}

export type HarnessFailureContext = (
  input: HarnessFailureInput,
  work: (unattributed?: true) => void,
) => void | Promise<void>;

export function observeHarness(
  ctx: Context,
  emit: (event: HarnessRuntimeEvent) => void,
  beforeStep?: (id: string) => Promise<void>,
  failureContext?: HarnessFailureContext,
): void {
  observeModelRequestContext(ctx);
  const log = new Logger('hub.harness');
  ctx.on('commands/change', () => {
    for (const agent of ctx.agents.list())
      emit({
        kind: 'commands',
        sessionId: agent.id,
        revision: createHash('sha256')
          .update(JSON.stringify(ctx.commands.list(agent)))
          .digest('hex'),
      });
  });
  ctx.on('session/event', (session, event) => {
    if (event.type === 'llm/retry')
      log.warn('model.retry_scheduled', { session_id: session.id, ...event.data });
    emit({ kind: 'session', sessionId: session.id, event });
  });
  observeCompactionContext(ctx, emit);
  observeSessionTrace(ctx);
  observeInbox(ctx, emit);
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    signal.throwIfAborted();
    if (beforeStep !== undefined) await settleInputAuthority(signal, () => beforeStep(agent.id));
    signal.throwIfAborted();
    return next();
  });
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    emit({ kind: 'stream', sessionId: agent.id, frame });
  });
  ctx.on('agent/status', ({ agent, status }) => {
    emit({ kind: 'status', sessionId: agent.id, status });
  });
  ctx.on('agent/error', ({ agent, turn, error }) => {
    writeFailure({ sessionId: agent.id, turn }, error, failureContext);
    emit({ kind: 'error', sessionId: agent.id, failure: describeFailure(error) });
  });
}

function writeFailure(
  input: HarnessFailureInput,
  error: unknown,
  context: HarnessFailureContext | undefined,
): void {
  const log = new Logger('hub.harness');
  let written = false;
  const write = (unattributed?: true): void => {
    if (written) return;
    written = true;
    log.error('session.failed', error, {
      session_id: input.sessionId,
      ...(unattributed === true ? { repair_origin: 'unknown' } : {}),
    });
  };
  const failed = (cause: unknown): void => {
    log.error('session.failure_context_failed', cause, { session_id: input.sessionId });
    write(true);
  };
  try {
    const pending = context?.(input, write);
    if (context === undefined) write();
    else if (pending !== undefined) background(pending.catch(failed), 'session.failure_log_failed');
  } catch (cause) {
    failed(cause);
  }
}

function observeInbox(ctx: Context, emit: (event: HarnessRuntimeEvent) => void): void {
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    emit({
      kind: 'input',
      sessionId: agent.id,
      messageId: nativeInputId(message) ?? message.id,
      turn,
    });
  });
  ctx.on('agent/inbox/discarded', ({ agent, message }) => {
    emit({
      kind: 'discarded',
      sessionId: agent.id,
      messageId: nativeInputId(message) ?? message.id,
    });
  });
}

async function settleInputAuthority(signal: AbortSignal, work: () => Promise<void>): Promise<void> {
  signal.throwIfAborted();
  let abort: ReturnType<typeof addAbortListener> | undefined;
  const cancelled = new Promise<void>((_resolve, reject) => {
    abort = addAbortListener(signal, () => {
      reject(
        new HarnessRuntimeError(
          'operation_failed',
          'Native step was canceled before its delivery authority settled.',
        ),
      );
    });
  });
  try {
    await Promise.race([work(), cancelled]);
    signal.throwIfAborted();
  } finally {
    abort?.[Symbol.dispose]();
  }
}
