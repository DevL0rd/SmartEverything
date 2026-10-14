import { inheritedOrigin } from '../../../assistant/authority-inheritance';
import {
  principalAuthority,
  admitExecutionTool,
  validateExecutionAuthority,
  withExecutionAuthorities,
  currentExecutionAuthorities,
} from '../../../assistant/execution-authority';
import { pluginCallAuthorities } from '../../../plugins/call-authority';
import type { ToolContext, ToolOutput } from './registry';
export function scopedToolCall(
  context: ToolContext,
  name: string,
  raw: Readonly<Record<string, unknown>>,
  work: (context: ToolContext) => Promise<ToolOutput> | ToolOutput,
): Promise<ToolOutput> | ToolOutput {
  const callback =
    context.caller?.via === 'plugin' ? pluginCallAuthorities(context.store, context.caller.id) : [];
  const authorities = [
    ...new Map(
      [
        ...(context.actor?.authority === undefined ? [] : [context.actor.authority]),
        ...callback,
        ...currentExecutionAuthorities(),
      ].map((source) => [source.event_id, source] as const),
    ).values(),
  ];
  const authority = principalAuthority(context.store, authorities);
  if (authority === undefined) return work(context);
  for (const source of authorities) {
    validateExecutionAuthority(context.store, source);
    admitExecutionTool(context.store, name, raw, source);
  }
  const event = context.store.assistantEvents.event(authority.event_id);
  const origin = inheritedOrigin(authorities);
  const actor = {
    ...context.actor,
    authority,
    clientId: authority.client_id,
    profileId: authority.profile_id,
    chatId: event.chat_id,
    ...(origin.plugin_id === null ? {} : { pluginId: origin.plugin_id }),
    ...(origin.requester === null ? {} : { pluginRequester: origin.requester }),
  };
  return withExecutionAuthorities(authorities, () => work({ ...context, actor }));
}
