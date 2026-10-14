import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { CompactionResult, CompactionTrigger } from '@deepseek-ai/dsh-compaction';
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import type { ResolvedConfig } from '@deepseek-ai/dsh-compaction-basic';
import { ASSISTANT_SETTINGS } from '@smarteverything/domain';
import { HarnessRuntimeError } from '../host/errors';

type PolicyReader = (sessionId: string, signal: AbortSignal) => Promise<number>;

export function bindCompactionPolicy(ctx: Context, read: PolicyReader): void {
  if (!(ctx.compaction instanceof ConfiguredCompaction))
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'Native compaction policy is unavailable.',
    );
  ctx.compaction.bindPolicy(read);
}

function initialConfig(engine: BasicCompactionEngine): ResolvedConfig {
  return engine.config;
}

export class ConfiguredCompaction extends BasicCompactionEngine {
  override config: ResolvedConfig = initialConfig(this);
  private readonly defaults = this.config;
  private readonly policy: { read: PolicyReader | undefined } = { read: undefined };

  bindPolicy(read: PolicyReader): void {
    this.policy.read = read;
  }

  override async compactIfNeeded(
    agent: Agent,
    trigger: CompactionTrigger,
    signal: AbortSignal,
  ): Promise<CompactionResult | null> {
    const read = this.policy.read;
    if (read === undefined)
      throw new HarnessRuntimeError(
        'runtime_unavailable',
        'Native compaction policy is not bound.',
      );
    const percent = ASSISTANT_SETTINGS.shape.compact_at_percent.parse(
      await read(agent.session.id, signal),
    );
    this.config = Object.freeze({ ...this.defaults, thresholdRatio: percent / 100 });
    return super.compactIfNeeded(agent, trigger, signal);
  }
}
