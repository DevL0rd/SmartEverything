import type { Context } from '@deepseek-ai/cordis';
import type { HarnessDispatcherOptions } from './dispatcher';
import { HarnessRuntimeError } from '../host/errors';
import { installMediaHistory } from './media-history';
export async function installDispatcherModels(
  ctx: Context,
  options: HarnessDispatcherOptions,
): Promise<Context> {
  let modelContext: Context | undefined;
  await ctx.inject(
    [
      'llm',
      'agents',
      'attachments',
      'systemPrompt',
      'tools',
      'compaction',
      'sessions',
      'permissionPresets',
      'workingDirectory',
      'tokenMeter',
    ],
    async (active): Promise<void> => {
      modelContext = active;
      await options.installModelRoutes(active);
      installMediaHistory(active, {
        load: options.loadAttachments,
        describe: options.describeImage,
        persistence: options.persistence,
      });
      active.on('tools/pre-execute', async (execution, next) => {
        if (execution.agent === undefined)
          return { kind: 'deny', reason: 'Native tools require an owned conversation.' };
        options.persistence.claim(execution.agent.id);
        return next();
      });
    },
  );

  if (modelContext === undefined)
    throw new HarnessRuntimeError(
      'runtime_unavailable',
      'Native model services did not finish installation.',
    );
  return modelContext;
}
