import type { ToolAction } from '@smarteverything/domain';
import { limitsOf } from '../ai-tools/plugin-turn';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { ActionOrigin } from './actions';

export class ToolActionError extends Error {
  override readonly name = 'ToolActionError';
}

export async function runToolAction(
  tools: ToolHub,
  action: ToolAction,
  origin: ActionOrigin,
): Promise<void> {
  const check = tools.check(action.tool, action.args);
  if (!check.ok) {
    throw new ToolActionError(check.reason);
  }
  const result = await tools.call(action.tool, action.args, {
    profileId: action.profileId,
    role: 'owner',
    chatId: null,
    via: 'automation',
    clientId: null,
    ...limitsOf(origin.plugin?.requester, origin.plugin?.plugin_id),
  });
  const error = result.response['error'];
  if (typeof error === 'string') {
    throw new ToolActionError(`${check.tool.title}: ${error}`);
  }
}
