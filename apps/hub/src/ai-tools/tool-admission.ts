import { ApiError } from '@smarteverything/domain';
import {
  admitExecutionTool,
  currentExecutionAuthority,
  executionRole,
  hubOriginated,
  inheritedOrigin,
  withExecutionAuthority,
} from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { HubLocalBoundary } from '../harness/hub-local-boundary';
import type { Store } from '../store/store';
import type { ToolCaller } from './hub-tool';
import { DISCOVERY_NAMES } from './tool-discovery';

export type ToolAdmission = (
  name: string,
  args: Readonly<Record<string, unknown>>,
  caller: ToolCaller,
) => ToolCaller;

export function toolAdmission(store: Store): ToolAdmission {
  const boundary = new HubLocalBoundary(store);
  return (name, args, caller) => {
    if (DISCOVERY_NAMES.has(name)) return caller;
    const authority = authorityOf(store, caller);
    if (authority === undefined) return caller;
    if (authority.profile_id !== caller.profileId)
      throw new ApiError('forbidden', 'Tool caller changed its initiating profile.');
    admitExecutionTool(store, name, authority);
    if (hubOriginated(authority)) {
      const refusal = withExecutionAuthority(authority, () => boundary.refusal(name, args));
      if (refusal !== undefined) throw new ApiError('forbidden', refusal);
    }
    return admittedCaller(caller, authority);
  };
}

function authorityOf(store: Store, caller: ToolCaller): ConversationAuthority | undefined {
  return (
    caller.authority ??
    currentExecutionAuthority() ??
    (caller.chatId === null ? undefined : store.harnessRecovery.latestAuthority(caller.chatId))
  );
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
