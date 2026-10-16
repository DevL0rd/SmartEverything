import type { Context, Fiber } from '@deepseek-ai/cordis';
import type { ToolExecution, ToolGuard } from '@deepseek-ai/dsh-tools';
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
import { mountWorkingDirectoryTool } from './working-directory';

declare module '@deepseek-ai/cordis' {
  interface Context {
    nativeExecutionGuard: (execution: Readonly<ToolExecution>) => void;
  }
}

export function bootComposition(
  root: Context,
  host: HarnessHost,
  options: HarnessRuntimeOptions,
): Fiber & PromiseLike<Fiber> {
  return root.plugin(async (ctx: Context): Promise<void> => {
    await Promise.all([
      mountCore(ctx, options.persistence, host.homeDirectory, host.target.kind === 'server'),
      mountLocalServices(ctx, host.homeDirectory, host.stateDirectory),
    ]);
    await mountLocalTools(ctx);
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
  const serverPolicy = await mountNativeExecutionGuard(ctx, host, options);
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
    ...(options.validateReferences === undefined
      ? {}
      : { validateReferences: options.validateReferences }),
    ...(options.configurationPending === undefined
      ? {}
      : { configurationPending: options.configurationPending }),
  });
  mountWorkingDirectoryTool(ctx, runtime);
  const unsubscribe = options.persistence.onOwnershipLost((id) => {
    runtime.ownershipLost(id);
  });
  ctx.effect(() => unsubscribe);
  return runtime;
}

async function mountNativeExecutionGuard(
  ctx: Context,
  host: HarnessHost,
  options: HarnessRuntimeOptions,
): Promise<HarnessServerPolicy> {
  const persistence = ctx.get('sessionPersistence');
  if (!(persistence instanceof HubSessionPersistence))
    throw new HarnessRuntimeError('operation_failed', 'Hub native persistence is not mounted.');
  const serverPolicy = new HarnessServerPolicy(
    host.target.kind === 'server',
    options.serverToolAccess,
    ctx,
  );
  const guards: readonly ToolGuard[] = [
    (execution): string | undefined =>
      execution.agent !== undefined && !persistence.owned(execution.agent.id)
        ? 'Session ownership is unavailable.'
        : undefined,
    (execution): string | undefined => serverPolicy.guard(execution),
  ];
  for (const guard of guards) ctx.tools.guard(guard);
  await ctx.plugin((active: Context): void => {
    active.provide('nativeExecutionGuard', (execution): void => {
      for (const guard of guards) {
        const reason = guard(execution);
        if (reason !== undefined) throw new HarnessRuntimeError('capability_unsupported', reason);
      }
    });
  });
  return serverPolicy;
}
