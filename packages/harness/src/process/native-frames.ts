import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { HARNESS_NATIVE_USAGE } from '@smarteverything/domain';
import type { HarnessNativeFrame } from '@smarteverything/domain';

type Unbound<T> = T extends unknown ? Omit<T, 'session_id' | 'epoch'> : never;
export type NativeFrameBody = Unbound<HarnessNativeFrame>;

export function streamFrame(frame: AssistantStreamFrame): NativeFrameBody | undefined {
  if (frame.type === 'start') return { kind: 'attempt', id: frame.attemptId, state: 'started' };
  if (frame.type !== 'chunk') {
    const committed =
      frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/message';
    return {
      kind: 'attempt',
      id: frame.attemptId,
      state: committed ? 'committed' : 'discarded',
    };
  }
  const chunk = frame.chunk;
  if (chunk.type === 'text-delta') return { kind: 'text', delta: chunk.text };
  if (chunk.type === 'reasoning-delta') return { kind: 'reasoning', delta: chunk.text };
  if (chunk.type === 'usage')
    return { kind: 'usage', usage: HARNESS_NATIVE_USAGE.parse(chunk.usage) };
  return undefined;
}
