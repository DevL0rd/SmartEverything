import type { AiHarnessSession } from '@smarteverything/domain';
import type { NativeBody, NativeEvent, NativeUsageRecord } from './event';
import { usageOfAssistant } from './event';

type Context = NonNullable<AiHarnessSession['context']>;
interface Request {
  readonly provider: string;
  readonly model: string;
  readonly contextWindow?: number | undefined;
}

export function contextInput(
  usage: Pick<NativeUsageRecord, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>,
): number {
  return usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
}

export class ReducerContext {
  private request: Request | undefined;
  private beforeCompaction: Context['state'] = 'unmeasured';
  value: Context = { capacity_tokens: null, input_tokens: null, state: 'unmeasured' };

  record(event: NativeEvent): boolean {
    const before = this.value;
    const body = event.body;
    if (body.type === 'request/context') this.requestContext(body.data);
    if (!event.replayed) this.settlement(body);
    if (body.type === 'compaction/start') {
      this.beforeCompaction = this.value.state;
      this.value = { ...this.value, state: 'compacting' };
    }
    if (event.surface === 'replace') this.value = { ...this.value, state: 'stale' };
    if (
      event.surface !== null &&
      this.value.estimate_tokens !== undefined &&
      this.value.estimate_tokens !== null
    )
      this.value = { ...this.value, estimate_tokens: null, state: 'stale' };
    if (body.type === 'compaction/end' && this.value.state === 'compacting')
      this.value = { ...this.value, state: this.beforeCompaction };
    return before !== this.value;
  }

  measure(
    usage: Pick<NativeUsageRecord, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>,
  ): void {
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

  private settlement(body: NativeBody): void {
    for (const usage of usageOfAssistant(body)) this.measure(usage);
  }

  private requestContext(request: Request): void {
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
