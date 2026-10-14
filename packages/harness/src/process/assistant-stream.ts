import type { AiHarnessSession } from '@smarteverything/domain';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { HarnessRuntimeEvent } from '../host/events';

export function projectAssistantStream(
  event: Extract<HarnessRuntimeEvent, { kind: 'stream' }>,
  session: AiHarnessSession | undefined,
  ports: {
    readonly send: (event: unknown) => Promise<void>;
    readonly usage: (usage: TokenUsage) => Promise<void>;
  },
): Promise<void> {
  const frame = event.frame;
  if (frame.type !== 'chunk') {
    if (session === undefined) return Promise.resolve();
    let state: 'started' | 'committed' | 'discarded' = 'discarded';
    if (frame.type === 'start') state = 'started';
    else if (frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message')
      state = 'committed';
    return ports.send({
      kind: 'state',
      session,
      assistant_attempt: { id: frame.attemptId, state },
    });
  }
  const chunk = frame.chunk;
  if (chunk.type === 'text-delta') return ports.send({ kind: 'text', delta: chunk.text });
  if (chunk.type === 'reasoning-delta') return ports.send({ kind: 'reasoning', delta: chunk.text });
  if (chunk.type === 'usage') return ports.usage(chunk.usage);
  return Promise.resolve();
}
