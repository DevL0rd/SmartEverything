import type { Context } from '@deepseek-ai/cordis';
import type { LoadedPlugin } from './claude-plugin-manifest';
import { mapMcpServer } from './claude-plugin-mcp';
import * as hooks from '@deepseek-ai/dsh-hooks-claude-code';
import * as mcp from '@deepseek-ai/dsh-mcp-client';
import type { InstalledHarnessSkillAsset } from './skill-assets';

const MCP_TOOL_CALL_TIMEOUT_MS = 60_000;
const executions = new WeakMap<Context, readonly LoadedPlugin[]>();

export function registerManagedPackageExecution(
  ctx: Context,
  scope: Context,
  source: {
    readonly plugins: readonly LoadedPlugin[];
    readonly assets: readonly InstalledHarnessSkillAsset[];
  },
): void {
  const confirmed = source.plugins.filter(
    (_plugin, index) => source.assets[index]?.asset.executes === true,
  );
  executions.set(ctx, confirmed);
  scope.effect(() => (): void => {
    if (executions.get(ctx) === confirmed) executions.delete(ctx);
  });
}

export async function mountManagedPackageExecution(
  ctx: Context,
  agentCtx: Context,
  session: { readonly directory: string; readonly native: boolean },
): Promise<void> {
  if (!session.native) return;
  for (const plugin of executions.get(ctx) ?? []) {
    if (plugin.components.hooksFile !== undefined)
      await agentCtx.plugin(hooks, {
        configPath: plugin.components.hooksFile,
        pluginRoot: plugin.root,
        projectDir: session.directory,
      });
    for (const [serverKey, entry] of Object.entries(plugin.components.mcpServers))
      await agentCtx.plugin(
        mcp,
        mapMcpServer(entry, {
          pluginName: plugin.metadata.name,
          pluginRoot: plugin.root,
          serverKey,
          toolCallTimeoutMs: MCP_TOOL_CALL_TIMEOUT_MS,
        }),
      );
  }
}
