import { contextInput } from './context';
import { narrowNativeEvent, usageOfAssistant } from './event';

export interface SettledUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens: number;
}

export function settledUsage(event: unknown): SettledUsage | undefined {
  const native = narrowNativeEvent(event);
  if (native.replayed) return undefined;
  const usage = usageOfAssistant(native.body).at(-1);
  if (usage === undefined) return undefined;
  return {
    inputTokens: contextInput(usage),
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
  };
}
