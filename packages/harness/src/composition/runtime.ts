import type { Context, Fiber } from '@deepseek-ai/cordis';
import { HarnessRuntime, type HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessHost } from '../host/contracts';
import { HarnessRuntimeError } from '../host/errors';
import { HarnessInteractions } from '../host/interactions';
import { HarnessConfiguration } from './configuration';
import { HarnessServerPolicy } from '../host/server-policy';
import { observeHarness } from '../host/events';
import { effectiveDshGeneration } from './generation';
import { MachineSessionPersistence } from '../persistence/service';
import { mountCore } from './core';
import { skillCatalogueLength } from './builtins';
import { mountLocalServices, mountLocalTools } from './local-tools';
import { mountWorkingDirectoryTool } from './working-directory';

export function bootComposition(
  root: Context,
  host: HarnessHost,
  options: HarnessRuntimeOptions,
): Fiber & PromiseLike<Fiber> {
  return root.plugin(async (ctx: Context): Promise<void> => {
    await Promise.all([
      mountCore(ctx, options.persistence, {
        cwd: host.homeDirectory,
        server: host.target.kind === 'server',
        catalogDescriptionMaxLength: skillCatalogueLength(options.desiredConfiguration),
      }),
      mountLocalServices(ctx, host.homeDirectory, host.stateDirectory),
    ]);
    await mountLocalTools(ctx, host.target.kind === 'server');
    await options.installModelRoutes(ctx);
  });
}

export async function initializeRuntime(
  ctx: Context,
  host: HarnessHost,
  options: HarnessRuntimeOptions,
  dispose: () => Promise<void>,
): Promise<HarnessRuntime> {
  const generation = await effectiveDshGeneration();
  const interactions = new HarnessInteractions(ctx, options.interactions);
  const serverPolicy = mountNativeExecutionGuard(ctx, host, options);
  const configuration = new HarnessConfiguration(
    ctx,
    { platform: host.platform, server: host.target.kind === 'server' },
    options.installedPlugins,
    options.configurationChanged,
  );
  await configuration.reconcile(options.desiredConfiguration);
  observeHarness(ctx, options.onEvent, options.beforeStep);
  const runtime = new HarnessRuntime(ctx, host, configuration, {
    interactions,
    dispose,
    serverPolicy,
    generation,
    notify: options.onEvent,
    ...(options.configurationPending === undefined
      ? {}
      : { configurationPending: options.configurationPending }),
  });
  mountWorkingDirectoryTool(ctx, runtime);
  const unsubscribe = options.persistence.onOwnershipLost((id) => {
    runtime.ownershipLost(id);
  });
  ctx.effect(() => unsubscribe);
  ctx.on('agent/status', ({ status }) => {
    if (status === 'idle') runtime.settleConfiguration();
  });
  return runtime;
}

function mountNativeExecutionGuard(
  ctx: Context,
  host: HarnessHost,
  options: HarnessRuntimeOptions,
): HarnessServerPolicy {
  const persistence = ctx.get('sessionPersistence');
  if (!(persistence instanceof MachineSessionPersistence))
    throw new HarnessRuntimeError('operation_failed', 'Hub native persistence is not mounted.');
  const serverPolicy = new HarnessServerPolicy(
    host.target.kind === 'server',
    options.serverToolAccess,
    ctx,
  );
  ctx.tools.guard((execution): string | undefined =>
    execution.agent !== undefined && !persistence.owned(execution.agent.id)
      ? 'Session ownership is unavailable.'
      : undefined,
  );
  ctx.tools.guard((execution): string | undefined => serverPolicy.guard(execution));
  return serverPolicy;
}
