import type { ToolAction } from '@smarteverything/domain';
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
    confirmed: false,
    clientId: null,
  });
  const error = result.response['error'];
  if (typeof error === 'string') {
    throw new ToolActionError(`${check.tool.title}: ${error}`);
  }
  if (result.response['needs_confirmation'] !== undefined) {
    throw new ToolActionError(
      `${check.tool.title} needs a person to confirm it, so the automation “${origin.name}” can’t run it.`,
    );
  }
}
