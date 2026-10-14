import type { Context, Fiber } from '@deepseek-ai/cordis';
import { HarnessRuntime, type HarnessRuntimeOptions } from '../host/runtime';
import type { HarnessHost } from '../host/contracts';
import { HarnessRuntimeError } from '../host/errors';
import { HarnessInteractions } from '../host/interactions';
import { HarnessConfiguration } from './configuration';
import { HarnessServerPolicy } from '../host/server-policy';
import { observeHarness } from '../host/events';
import { effectiveDshGeneration } from './generation';
import { HubSessionPersistence } from '../persistence/service';
import { mountCore } from './core';
import { mountLocalServices, mountLocalTools } from './local-tools';
import { mountProjectGuards } from './project-permission';

export function bootComposition(
  root: Context,
  host: HarnessHost,
  options: HarnessRuntimeOptions,
): Fiber & PromiseLike<Fiber> {
  return root.plugin(async (ctx: Context): Promise<void> => {
    await Promise.all([
      mountCore(ctx, options.persistence, host.homeDirectory, host.target.kind === 'server'),
      mountLocalServices(ctx, host.homeDirectory, host.stateDirectory, {
        server: host.target.kind === 'server',
        ...(options.projectFiles === undefined ? {} : { projectFiles: options.projectFiles }),
      }),
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
  const configuration = new HarnessConfiguration(
    ctx,
    { platform: host.platform, server: host.target.kind === 'server' },
    options.installedPlugins,
    options.configurationChanged,
  );
  await configuration.reconcile(options.desiredConfiguration);
  const persistence = ctx.get('sessionPersistence');
  if (!(persistence instanceof HubSessionPersistence))
    throw new HarnessRuntimeError('operation_failed', 'Hub native persistence is not mounted.');
  ctx.tools.guard((execution) =>
    execution.agent !== undefined && !persistence.owned(execution.agent.id)
      ? 'Session ownership is unavailable.'
      : undefined,
  );
  const serverPolicy = new HarnessServerPolicy(
    host.target.kind === 'server',
    options.serverToolAccess,
  );
  ctx.tools.guard((execution) => serverPolicy.guard(execution));
  mountProjectGuards(ctx, host.target.kind === 'server');
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
  const unsubscribe = options.persistence.onOwnershipLost((id) => {
    runtime.ownershipLost(id);
  });
  ctx.effect(() => unsubscribe);
  return runtime;
}
