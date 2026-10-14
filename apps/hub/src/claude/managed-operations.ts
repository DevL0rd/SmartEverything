import { ApiError, type ClaudeCliAction, type ClaudeCliReceipt } from '@smarteverything/domain';
import {
  expectedClaudeScope,
  ownedClaudeScope,
  type ManagedClaudeActor,
  type ManagedClaudeContext,
  type ManagedClaudeScope,
} from './managed-scope';

export function validateCliAction(
  context: ManagedClaudeContext,
  scope: ManagedClaudeScope,
  action: ClaudeCliAction,
): void {
  expectedClaudeScope(context, scope, action);
  const state = scope.runner.state.read(scope.chat);
  if (action.action === 'resume' && (state.session_id === null || state.state === 'working'))
    throw new ApiError(
      'conflict',
      'Resume requires this chat’s saved native session and no running turn.',
    );
  if ((action.action === 'stop' || action.action === 'close') && state.job_id === null)
    throw new ApiError(
      'conflict',
      'This saved CLI session has no running process to stop or close.',
    );
  if (action.action === 'stop') requireRunningCliTurn(state.state);
  const engine = changedCliEngine(scope, action);
  if (engine !== null) {
    const selections = context.assistant.selections;
    if (selections === null)
      throw new ApiError('conflict', 'The native Claude provider is starting.');
    selections.validate(engine, 'owner');
  }
}
export async function applyCliAction(
  context: ManagedClaudeContext,
  actor: ManagedClaudeActor,
  scope: ManagedClaudeScope,
  action: ClaudeCliAction,
): Promise<Pick<ClaudeCliReceipt, 'message_id' | 'application'>> {
  if (action.action === 'send' || action.action === 'resume') {
    const message = context.assistant.send(
      actor,
      { ...action.message, client_message_id: action.operation_id },
      scope.chat.id,
    );
    return { message_id: message.id, application: 'native' };
  }
  if (action.action === 'stop') {
    await context.assistant.interrupt(actor, scope.chat.id);
    return { message_id: null, application: 'native' };
  }
  if (action.action === 'close') {
    await scope.runner.control(scope.chat, { action: 'close' });
    return { message_id: null, application: 'native' };
  }
  const engine = changedCliEngine(scope, action);
  if (engine === null)
    throw new ApiError('invalid_request', 'This CLI action has no engine settings.');
  if (action.job_id === null) {
    await context.assistant.updateChat(actor, scope.chat.id, { engine });
    return { message_id: null, application: 'next_turn' };
  }
  await scope.runner.control(
    scope.chat,
    action.action === 'set_model'
      ? { action: 'set_model', model: action.model }
      : { action: 'set_permission_mode', mode: action.mode },
  );
  ownedClaudeScope(context, actor, scope.chat.engine.device_id, scope.chat.id);
  expectedClaudeScope(context, scope, action);
  const current = context.store.aiChats.chat(scope.chat.id);
  if (JSON.stringify(current.engine) !== JSON.stringify(scope.chat.engine))
    throw new ApiError(
      'conflict',
      'The CLI engine configuration changed before its native acknowledgement.',
    );
  context.store.aiChats.update(scope.chat.id, { engine });
  return { message_id: null, application: 'native' };
}
function requireRunningCliTurn(state: string): void {
  if (state !== 'working')
    throw new ApiError('conflict', 'This retained CLI process has no running turn to interrupt.');
}

function changedCliEngine(
  scope: ManagedClaudeScope,
  action: ClaudeCliAction,
): ManagedClaudeScope['chat']['engine'] | null {
  if (action.action === 'set_model') return { ...scope.chat.engine, model: action.model };
  if (action.action === 'set_permission_mode')
    return {
      ...scope.chat.engine,
      settings: { ...scope.chat.engine.settings, permission_mode: action.mode },
    };
  return null;
}
