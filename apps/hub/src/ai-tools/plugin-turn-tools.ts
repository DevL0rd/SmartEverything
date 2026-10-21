import { API_ENDPOINTS, mcpToolOperation, type EndpointName } from '@smarteverything/domain';
import { z } from 'zod';
import { partCallOf } from '../extensions/mcp/tools';
import { ToolError } from '../extensions/mcp/tools/registry';
import type { HubTool } from './hub-tool';
import { PluginTurnRefusedError, operationRefusal } from './plugin-turn';

const CALL_OPERATION_TOOL = 'operation_call';

const CALL_PLUGIN_TOOL = 'plugin_call';

const OPERATION_CALL = z.looseObject({ operation: z.string() });

const PLUGIN_TOOL_CALL = z.looseObject({ pluginId: z.string(), tool: z.string() });

export type OfferedPluginTool = (pluginId: string, tool: string) => HubTool | undefined;

function isEndpointName(name: string): name is EndpointName {
  return Object.hasOwn(API_ENDPOINTS, name);
}

function pluginToolRefusal(
  args: Readonly<Record<string, unknown>>,
  offered: OfferedPluginTool,
): PluginTurnRefusedError | null {
  const call = PLUGIN_TOOL_CALL.safeParse(args);
  if (!call.success || offered(call.data.pluginId, call.data.tool) !== undefined) {
    return null;
  }
  return new PluginTurnRefusedError(
    `${call.data.pluginId}: ${call.data.tool}`,
    'it is human-only, switched off or not there, and only a person in the app can run those.',
  );
}

function partOf(
  name: string,
  args: Readonly<Record<string, unknown>>,
): ReturnType<typeof partCallOf> | null {
  try {
    return partCallOf(name, args);
  } catch (cause) {
    if (cause instanceof ToolError) {
      return null;
    }
    throw cause;
  }
}

export function toolRefusal(
  name: string,
  args: Readonly<Record<string, unknown>>,
  offered: OfferedPluginTool,
): PluginTurnRefusedError | null {
  const part = partOf(name, args);
  if (part === null) {
    return null;
  }
  if (part.name === CALL_PLUGIN_TOOL) {
    return pluginToolRefusal(part.args, offered);
  }
  if (part.name === CALL_OPERATION_TOOL) {
    const call = OPERATION_CALL.safeParse(part.args);
    return call.success && isEndpointName(call.data.operation)
      ? operationRefusal(call.data.operation)
      : null;
  }
  const operation = mcpToolOperation(part.name);
  return operation === undefined ? null : operationRefusal(operation);
}
