import type { Logger } from '@smarteverything/logging';
import { runTool, type ToolRun } from '../extensions/mcp/dispatch';
import { TOOLS, toolNamed } from '../extensions/mcp/tools';
import {
  PLUGIN_ONLY_TOOLS,
  type ToolActor,
  type ToolContext,
  type ToolImage,
} from '../extensions/mcp/tools/registry';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolCaller,
  type ToolPicture,
  type ToolSource,
} from './hub-tool';
import { switchedOffTools } from './tool-discovery';
import { toolLine } from './tool-lines';

export const SE_TOOLS: readonly HubTool[] = TOOLS.filter(
  (tool) => !PLUGIN_ONLY_TOOLS.has(tool.name),
).map(({ listing, variants }) => ({
  ...listing,
  ...(variants === undefined ? {} : { variants }),
  origin: { kind: 'se' },
  humanOnly: false,
}));

function picturesOf(images: readonly ToolImage[]): ToolPicture[] {
  return images.map(({ data, mimeType }) => ({ data: Buffer.from(data, 'base64'), mimeType }));
}

function actorOf(caller: ToolCaller): ToolActor {
  return {
    clientId: caller.clientId,
    ...(caller.authority === undefined ? {} : { authority: caller.authority }),
    profileId: caller.profileId,
    role: caller.role,
    chatId: caller.chatId,
    ...(caller.pluginRequester === undefined ? {} : { pluginRequester: caller.pluginRequester }),
    ...(caller.pluginId === undefined ? {} : { pluginId: caller.pluginId }),
  };
}

export function hubResult(
  run: ToolRun,
  tool: HubTool,
  args: Readonly<Record<string, unknown>>,
  deviceName: (id: string) => string | null,
): HubToolResult {
  switch (run.kind) {
    case 'unknown':
      return failure(`There is no tool named ${tool.name}`);
    case 'refused':
      return failure(run.refusal.message, { code: run.refusal.code });
    case 'done':
      return {
        response: { result: run.output.structured },
        line: toolLine({ tool, args, deviceName }),
        pictures: picturesOf(run.output.images ?? []),
      };
  }
}

export interface SeToolsOptions {
  readonly context: ToolContext;
  readonly deviceName: (id: string) => string | null;
  readonly log: Logger;
}

export class SeTools implements ToolSource {
  constructor(private readonly options: SeToolsOptions) {}

  tools(): readonly HubTool[] {
    const off = switchedOffTools(this.options.context.store.settings.read().mcp_disabled_tools);
    return SE_TOOLS.filter((tool) => !off.has(tool.name));
  }

  changes(listener: () => void): () => void {
    return this.options.context.store.feed.subscribe((change) => {
      if (change.table === 'settings') {
        listener();
      }
    });
  }

  validate(tool: HubTool, args: Readonly<Record<string, unknown>>): string | null {
    const found = toolNamed(tool.name);
    return found === undefined
      ? `There is no tool named ${tool.name}`
      : found.check(this.options.context, args);
  }

  async call(
    tool: HubTool,
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ): Promise<HubToolResult> {
    const run = await runTool(
      { ...this.options.context, actor: actorOf(caller) },
      tool.name,
      args,
      this.options.log,
    );
    return hubResult(run, tool, args, this.options.deviceName);
  }
}
