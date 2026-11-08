import {
  pluginNodeKindId,
  pluginToolName,
  type PluginAutomation,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import {
  failure,
  type HubTool,
  type HubToolResult,
  type ToolCaller,
} from '../../ai-tools/hub-tool';
import type { ToolCheck, ToolHub } from '../../ai-tools/tool-hub';
import type { PluginNodeDeclaration } from './perform';

export type DriverToolReply = Readonly<Record<string, unknown>>;

export interface DriverTool {
  readonly name: string;
  readonly description: string;
  readonly input: z.ZodType;
  readonly run: (
    args: Readonly<Record<string, unknown>>,
    caller: ToolCaller,
  ) => Promise<DriverToolReply>;
}

export type DriverOptionProvider = (
  query: PluginOptionQuery,
  caller: ToolCaller,
) => Promise<PluginOptionPage>;

export interface DriverRuntime {
  readonly tools: readonly DriverTool[];
  readonly options: Readonly<Record<string, DriverOptionProvider>>;
}

export type NodeTools = Pick<ToolHub, 'check' | 'call'>;

interface Registered {
  readonly automation: PluginAutomation;
  readonly runtime: DriverRuntime;
}

function hubToolOf(driverId: string, tool: DriverTool): HubTool {
  return {
    name: pluginToolName(driverId, tool.name),
    title: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(tool.input),
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    origin: { kind: 'core' },
    humanOnly: true,
  };
}

export class DriverNodes {
  private readonly drivers = new Map<string, Registered>();

  register(driverId: string, automation: PluginAutomation, runtime: DriverRuntime): () => void {
    const entry = { automation, runtime };
    this.drivers.set(driverId, entry);
    return (): void => {
      if (this.drivers.get(driverId) === entry) this.drivers.delete(driverId);
    };
  }

  declaration(kindId: string): PluginNodeDeclaration | undefined {
    for (const [driverId, { automation }] of this.drivers) {
      const owner = { kind: 'driver', id: driverId } as const;
      const node = automation.nodes.find(
        (candidate) => pluginNodeKindId(owner, candidate.id) === kindId,
      );
      if (node !== undefined) return { pluginId: driverId, node };
    }
    return undefined;
  }

  options(
    driverId: string,
    entityId: string,
    query: PluginOptionQuery,
    caller: ToolCaller,
  ): Promise<PluginOptionPage> | undefined {
    const entry = this.drivers.get(driverId);
    const declared = entry?.automation.entities.find((entity) => entity.id === entityId);
    const provider = declared === undefined ? undefined : entry?.runtime.options[declared.options];
    return provider?.(query, caller);
  }

  over(base: () => NodeTools): NodeTools {
    return {
      check: (name, args): ToolCheck => {
        const owned = this.owned(name);
        if (owned === undefined) return base().check(name, args);
        const parsed = owned.tool.input.safeParse(args);
        return parsed.success
          ? { ok: true, tool: hubToolOf(owned.driverId, owned.tool) }
          : { ok: false, reason: z.prettifyError(parsed.error) };
      },
      call: async (name, args, caller): Promise<HubToolResult> => {
        const owned = this.owned(name);
        if (owned === undefined) return await base().call(name, args, caller);
        try {
          const response = await owned.tool.run(args, caller);
          return { response, line: '', pictures: [] };
        } catch (cause) {
          return failure(messageOf(cause));
        }
      },
    };
  }

  private owned(name: string): { driverId: string; tool: DriverTool } | undefined {
    for (const [driverId, { runtime }] of this.drivers) {
      const tool = runtime.tools.find(
        (candidate) => pluginToolName(driverId, candidate.name) === name,
      );
      if (tool !== undefined) return { driverId, tool };
    }
    return undefined;
  }
}
