import { API_ENDPOINTS as E, ApiError, type PluginSearchHit } from '@smarteverything/domain';
import type { ToolCaller } from '../../ai-tools/hub-tool';
import type { PluginAdmin } from '../../plugins/plugin-admin';
import { searchHitsOf } from '../../plugins/search-hits';
import type { Store } from '../../store/store';
import { clientOf, profileIdOf, type Caller } from '../auth';
import { DONE_REPLY, bound, type Bound } from '../router';

export type PluginRouteName =
  | 'listPlugins'
  | 'installPlugin'
  | 'updatePlugin'
  | 'restartPlugin'
  | 'removePlugin'
  | 'readPluginTools'
  | 'callPluginTool'
  | 'readPluginLog'
  | 'readPluginData'
  | 'listPluginSearch'
  | 'postPluginMessage';

type PluginRoutes = Record<PluginRouteName, Bound>;

function toolCallerOf(store: Store, caller: Caller): ToolCaller {
  const client = clientOf(caller);
  return {
    profileId: profileIdOf(store, caller),
    role: client.role,
    chatId: caller.kind === 'client' ? (caller.chatId ?? null) : null,
    via: caller.kind === 'client' && caller.via === 'assistant' ? 'chat' : 'app',
    confirmed: false,
    clientId: client.id,
  };
}

function onThisComputer(caller: Caller): void {
  if (!clientOf(caller).built_in) {
    throw new ApiError(
      'forbidden',
      'Add plugins from a folder in the desktop app on this computer.',
    );
  }
}

export function pluginRoutes(store: Store, admin: PluginAdmin): PluginRoutes {
  return {
    listPlugins: bound(E.listPlugins, () => admin.list()),
    installPlugin: bound(E.installPlugin, ({ body, caller }) => {
      if (body.source === 'local') {
        onThisComputer(caller);
      }
      return admin.install(body);
    }),
    updatePlugin: bound(E.updatePlugin, ({ params, body }) => admin.update(params.pluginId, body)),
    restartPlugin: bound(E.restartPlugin, ({ params }) => admin.restart(params.pluginId)),
    removePlugin: bound(E.removePlugin, async ({ params }) => {
      await admin.remove(params.pluginId);
      return DONE_REPLY;
    }),
    readPluginTools: bound(E.readPluginTools, ({ params }) => admin.tools(params.pluginId)),
    callPluginTool: bound(E.callPluginTool, ({ params, body, caller }) =>
      admin.callTool(params.pluginId, params.tool, body, toolCallerOf(store, caller)),
    ),
    readPluginLog: bound(E.readPluginLog, ({ params }) => [...admin.log(params.pluginId)]),
    readPluginData: bound(E.readPluginData, ({ params, query }) =>
      admin.data(params.pluginId, query.stream, query.limit),
    ),
    listPluginSearch: bound(E.listPluginSearch, (): PluginSearchHit[] => searchHitsOf(store)),
    postPluginMessage: bound(E.postPluginMessage, ({ body, caller }) => {
      if (caller.kind !== 'client' || caller.pluginId === undefined) {
        throw new ApiError('forbidden', 'Only a plugin’s own key can post plugin messages.');
      }
      admin.post(caller.pluginId, body);
      return DONE_REPLY;
    }),
  };
}
