import { ApiError, MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import {
  currentExecutionAuthority,
  executionRole,
  hubOriginated,
  inheritedOrigin,
  withExecutionAuthority,
  executionToolAdmitted,
} from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { HubLocalBoundary } from '../harness/hub-local-boundary';
import type { Store } from '../store/store';
import type { ToolCaller } from './hub-tool';

export type ToolAdmission = (
  name: string,
  args: Readonly<Record<string, unknown>>,
  caller: ToolCaller,
) => Promise<ToolCaller>;

export function toolAdmission(store: Store): ToolAdmission {
  const boundary = new HubLocalBoundary(store);
  return async (name, args, caller) => {
    if (MCP_DISCOVERY_TOOLS.has(name)) return caller;
    const authority = await authorityOf(store, caller);
    if (authority === undefined) return caller;
    if (authority.profile_id !== caller.profileId)
      throw new ApiError('forbidden', 'Tool caller changed its initiating profile.');
    await executionToolAdmitted(store, name, authority);
    if (hubOriginated(authority)) {
      const refusal = await withExecutionAuthority(authority, () => boundary.refusal(name, args));
      if (refusal !== undefined) throw new ApiError('forbidden', refusal);
    }
    return admittedCaller(caller, authority);
  };
}

async function authorityOf(
  store: Store,
  caller: ToolCaller,
): Promise<ConversationAuthority | undefined> {
  const held = caller.authority ?? currentExecutionAuthority();
  if (held !== undefined || caller.chatId === null) return held;
  return store.host.call('harnessRecovery', 'latestAuthority', caller.chatId);
}

function admittedCaller(caller: ToolCaller, authority: ConversationAuthority): ToolCaller {
  const origin = inheritedOrigin([
    authority,
    { plugin_id: caller.pluginId ?? null, requester: caller.pluginRequester ?? null },
  ]);
  return {
    ...caller,
    authority,
    clientId: authority.client_id,
    role: executionRole(authority) === 'member' ? 'member' : caller.role,
    ...(origin.plugin_id === null ? {} : { pluginId: origin.plugin_id }),
    ...(origin.requester === null ? {} : { pluginRequester: origin.requester }),
  };
}
