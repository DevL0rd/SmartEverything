import { Service, type Context } from '@deepseek-ai/cordis';
import * as CommandGoal from '@deepseek-ai/dsh-command-goal';
import Goal from '@deepseek-ai/dsh-goal';
import * as GoalRoundDriver from '@deepseek-ai/dsh-goal-round-driver';
import * as ToolGoal from '@deepseek-ai/dsh-tool-goal';
import { AI_AGENT_LOOP_SETTINGS, type AiAgentLoopSettings } from '@smarteverything/domain';

declare module '@deepseek-ai/cordis' {
  interface Context {
    agentLoopSettings: AgentLoopSettingsService;
  }
}

export class AgentLoopSettingsService extends Service {
  static readonly Config = AI_AGENT_LOOP_SETTINGS;

  constructor(
    ctx: Context,
    readonly settings: AiAgentLoopSettings,
  ) {
    super(ctx, 'agentLoopSettings');
  }
}

export const name = 'goals';

export function configured<K extends string>(
  pairs: readonly (readonly [K, number | undefined])[],
): Partial<Record<K, number>> {
  const config: Partial<Record<K, number>> = {};
  for (const [key, value] of pairs) if (value !== undefined) config[key] = value;
  return config;
}

export async function provideAgentLoopSettings(ctx: Context): Promise<void> {
  if (!ctx.registry.has(AgentLoopSettingsService))
    await ctx.plugin(AgentLoopSettingsService, AI_AGENT_LOOP_SETTINGS.parse({}));
}

export async function bindAgentLoopSettings(
  ctx: Context,
  settings: AiAgentLoopSettings,
): Promise<void> {
  await provideAgentLoopSettings(ctx);
  const parsed = AI_AGENT_LOOP_SETTINGS.parse(settings);
  for (const fiber of ctx.registry.get(AgentLoopSettingsService)?.fibers ?? []) {
    fiber.update(parsed);
    await fiber.await();
  }
}

async function mountGoals(scope: Context): Promise<void> {
  const { goal } = scope.agentLoopSettings.settings;
  await scope.plugin(Goal, configured([['defaultMaxGoalRounds', goal.default_max_rounds]]));
  await scope.plugin(CommandGoal);
  await scope.plugin(
    ToolGoal,
    configured([['blockedAfterConsecutiveRounds', goal.blocked_after_rounds]]),
  );
  await scope.plugin(GoalRoundDriver);
}

export async function mount(ctx: Context): Promise<void> {
  await provideAgentLoopSettings(ctx);
  await ctx.inject(['agentLoopSettings'], mountGoals);
}
