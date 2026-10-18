import { Context } from '@deepseek-ai/cordis';
import { bootComposition, initializeRuntime } from '../composition/runtime';
import { HARNESS_HOST } from './contracts';
import { HarnessRuntimeError } from './errors';
import type { HarnessRuntime, HarnessRuntimeOptions } from './runtime';

export async function createHarnessRuntime(
  options: HarnessRuntimeOptions,
): Promise<HarnessRuntime> {
  const host = HARNESS_HOST.parse(options.host);
  const root = new Context();
  const fiber = bootComposition(root, host, options);
  try {
    await fiber;
    let runtime: HarnessRuntime | undefined;
    await fiber.ctx.inject(
      [
        'fs',
        'agents',
        'sessions',
        'sessionPersistence',
        'jobs',
        'tools',
        'workingDirectory',
        'permissionPresets',
        'sessionProjections',
        'compaction',
        'commands',
        'systemPrompt',
        'llm',
        'attachments',
      ],
      async (ctx: Context): Promise<void> => {
        runtime = await initializeRuntime(ctx, host, options, fiber.dispose);
      },
    );
    if (runtime === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Harness runtime consumer did not activate.',
      );
    return runtime;
  } catch (error) {
    await fiber.dispose();
    throw error;
  }
}
