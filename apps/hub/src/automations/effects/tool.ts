import {
  JSON_VALUE,
  type JsonValue,
  type PluginOrigin,
  type ToolAction,
} from '@smarteverything/domain';
import { z } from 'zod';
import { limitsOf } from '../../ai-tools/plugin-turn';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { currentExecutionAuthority, executionRole } from '../../assistant/turn-authority';

const TOOL_RESPONSE = z.record(z.string(), JSON_VALUE);

export type JsonObject = Readonly<Record<string, JsonValue>>;

export interface ToolOrigin {
  readonly plugin: PluginOrigin | null;
}

export type ToolRequest = Pick<ToolAction, 'profileId' | 'tool' | 'args'>;

export class ToolActionError extends Error {
  override readonly name = 'ToolActionError';
}

export async function callTool(
  tools: Pick<ToolHub, 'check' | 'call'>,
  action: ToolRequest,
  origin: ToolOrigin,
): Promise<JsonObject> {
  const check = tools.check(action.tool, action.args);
  if (!check.ok) {
    throw new ToolActionError(check.reason);
  }
  const authority = currentExecutionAuthority();
  const result = await tools.call(action.tool, action.args, {
    profileId: action.profileId,
    role: authority === undefined ? 'owner' : executionRole(authority),
    chatId: null,
    via: 'automation',
    clientId: null,
    ...limitsOf(origin.plugin?.requester, origin.plugin?.plugin_id),
  });
  const error = result.response['error'];
  if (typeof error === 'string') {
    throw new ToolActionError(`${check.tool.title}: ${error}`);
  }
  return TOOL_RESPONSE.parse(result.response);
}
