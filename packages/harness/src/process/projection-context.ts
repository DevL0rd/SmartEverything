import { z } from 'zod';
import {
  isReplacementSurfaceEvent,
  isSurfaceEvent,
  type SessionEvent,
} from '@deepseek-ai/dsh-session';
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { AiHarnessSession } from '@smarteverything/domain';

type Context = NonNullable<AiHarnessSession['context']>;
const REQUEST = z.object({
  provider: z.string(),
  model: z.string(),
  contextWindow: z.int().positive().optional(),
});
const USAGE = z.object({
  inputTokens: z.int().nonnegative(),
  cacheReadTokens: z.int().nonnegative().optional(),
  cacheWriteTokens: z.int().nonnegative().optional(),
});

export function contextInput(
  usage: Pick<TokenUsage, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>,
): number {
  const measured = USAGE.parse(usage);
  return measured.inputTokens + (measured.cacheReadTokens ?? 0) + (measured.cacheWriteTokens ?? 0);
}
export class ProcessContextProjection {
  private request: z.infer<typeof REQUEST> | undefined;
  private beforeCompaction: Context['state'] = 'unmeasured';
  value: Context = { capacity_tokens: null, input_tokens: null, state: 'unmeasured' };
  record(event: SessionEvent): boolean {
    const before = this.value;
    if (event.type === 'request/context') this.requestContext(event.data);
    this.settlement(event);
    if (event.type === 'compaction/start') {
      this.beforeCompaction = this.value.state;
      this.value = { ...this.value, state: 'compacting' };
    }
    if (isReplacementSurfaceEvent(event)) this.value = { ...this.value, state: 'stale' };
    if (
      isSurfaceEvent(event) &&
      this.value.estimate_tokens !== undefined &&
      this.value.estimate_tokens !== null
    )
      this.value = { ...this.value, estimate_tokens: null, state: 'stale' };
    if (event.type === 'compaction/end' && this.value.state === 'compacting')
      this.value = { ...this.value, state: this.beforeCompaction };
    return before !== this.value;
  }
  private settlement(event: SessionEvent): void {
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return;
    for (const record of event.data.stream)
      if (record.type === 'chunk' && record.chunk.type === 'usage')
        this.measure(record.chunk.usage);
  }
  measure(usage: Pick<TokenUsage, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): void {
    this.value = {
      ...this.value,
      input_tokens: contextInput(usage),
      estimate_tokens: null,
      state: 'measured',
    };
  }
  estimate(tokens: number | null): void {
    this.value = { ...this.value, estimate_tokens: tokens, state: 'stale' };
  }
  private requestContext(data: unknown): void {
    const request = REQUEST.parse(data);
    const same =
      this.request?.provider === request.provider &&
      this.request.model === request.model &&
      this.request.contextWindow === request.contextWindow;
    this.value = {
      provider: request.provider,
      model: request.model,
      capacity_tokens: request.contextWindow ?? null,
      input_tokens: same ? this.value.input_tokens : null,
      estimate_tokens: same ? this.value.estimate_tokens : null,
      state: same ? this.value.state : 'unmeasured',
    };
    this.request = request;
  }
}
