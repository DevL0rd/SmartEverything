import { ApiError, MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import {
  admitExecutionTool,
  currentExecutionAuthority,
  executionRole,
  hubOriginated,
  inheritedOrigin,
  withExecutionAuthority,
} from '../../../assistant/turn-authority';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import { NATIVE_BRIDGE_REFUSAL, reachesNativeBridge } from '../../../harness/native-bridge';
import { pluginCallAuthority } from '../../../plugins/call-authority';
import type { ToolActor, ToolContext, ToolOutput } from './registry';
type Scoped = Pick<ToolContext, 'store' | 'actor' | 'caller' | 'servedTool'>;

export function scopedToolCall<C extends Scoped>(
  context: C,
  name: string,
  work: (context: C) => Promise<ToolOutput> | ToolOutput,
): Promise<ToolOutput> | ToolOutput {
  const callback =
    context.caller?.via === 'plugin'
      ? pluginCallAuthority(context.store, context.caller.id)
      : undefined;
  const authority = context.actor?.authority ?? callback ?? currentExecutionAuthority();
  if (authority === undefined) return work(context);
  const actor =
    context.actor?.authority === undefined
      ? admitted(context, context.servedTool ?? name, authority)
      : context.actor;
  return withExecutionAuthority(authority, () => work({ ...context, actor }));
}
function admitted(context: Scoped, name: string, authority: ConversationAuthority): ToolActor {
  if (!MCP_DISCOVERY_TOOLS.has(name)) {
    admitExecutionTool(context.store, name, authority);
    if (hubOriginated(authority) && reachesNativeBridge(name))
      throw new ApiError('forbidden', NATIVE_BRIDGE_REFUSAL);
  }
  return actorOf(context, authority);
}
function actorOf(context: Scoped, authority: ConversationAuthority): ToolActor {
  const origin = inheritedOrigin([
    authority,
    {
      plugin_id: context.actor?.pluginId ?? null,
      requester: context.actor?.pluginRequester ?? null,
    },
  ]);
  return {
    ...context.actor,
    authority,
    clientId: authority.client_id,
    profileId: authority.profile_id,
    role: executionRole(authority),
    chatId: context.store.assistantEvents.event(authority.event_id).chat_id,
    ...(origin.plugin_id === null ? {} : { pluginId: origin.plugin_id }),
    ...(origin.requester === null ? {} : { pluginRequester: origin.requester }),
  };
}
