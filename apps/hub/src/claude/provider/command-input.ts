import { createHash } from 'node:crypto';
import type { SDKUserMessage, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderTurn, JsonValue } from '@smarteverything/domain';
import type { ProviderPayload } from './events';
import type { ProviderCommandCatalogue } from './command-catalogue';
import { userMessageOf } from './input';
import { canonicalRuntimeInput } from '../../computers/runtime-receipts';
export function commandBinding(
  turn: Pick<ProviderTurn, 'model' | 'effort' | 'options' | 'tools'>,
): string {
  return createHash('sha256')
    .update(
      canonicalRuntimeInput({
        model: turn.model,
        effort: turn.effort,
        options: turn.options,
        tools: turn.tools,
      }),
    )
    .digest('hex');
}
export function commandRevision(revision: string, turn: ProviderTurn): string {
  return createHash('sha256')
    .update(canonicalRuntimeInput([revision, commandBinding(turn)]))
    .digest('hex');
}
export function commandMessage(
  turn: ProviderTurn,
  name: string,
  argumentsText: string,
): SDKUserMessage {
  return userMessageOf({
    ...turn,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `/${name}${argumentsText === '' ? '' : ` ${argumentsText}`}` },
        ],
      },
    ],
  });
}
export function commandSource(
  record: Record<string, JsonValue>,
  turn: ProviderTurn,
  catalogue: ProviderCommandCatalogue,
): Record<string, JsonValue> {
  const definitions =
    record['type'] === 'system' &&
    ['init', 'commands_changed'].includes(
      typeof record['subtype'] === 'string' ? record['subtype'] : '',
    );
  return {
    ...record,
    _command_revision: commandRevision(catalogue.revision, turn),
    _command_binding: commandBinding(turn),
    ...(definitions ? { _native_commands: catalogue.raw() } : {}),
  };
}
export function commandResultText(message: SDKMessage): string {
  return message.type === 'result' && message.subtype === 'success' ? message.result : '';
}
export function rememberPending(waiting: Set<string>, event: ProviderPayload): void {
  if (event.kind === 'prompt') {
    if (event.prompt.state === 'waiting') waiting.add(event.prompt.id);
    else waiting.delete(event.prompt.id);
  }
  if (event.kind === 'dialog') {
    if ((event.status ?? 'pending') === 'pending') waiting.add(event.prompt_id);
    else waiting.delete(event.prompt_id);
  }
}
