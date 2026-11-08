import {
  API_ENDPOINTS as E,
  ApiError,
  type PluginOptionPage,
  type PluginOptionQuery,
} from '@smarteverything/domain';
import type { ToolCaller } from '../../ai-tools/hub-tool';
import type { PluginKindCatalog } from '../../automations/plugin-kinds/catalog';
import type { DriverNodes } from '../../automations/plugin-kinds/driver-nodes';
import type { PluginAdmin } from '../../plugins/plugin-admin';
import type { Store } from '../../store/store';
import { bound } from '../router';
import { toolCallerOf } from './plugins';

interface EntityRequest {
  readonly pluginId: string;
  readonly entity: string;
  readonly query: PluginOptionQuery;
  readonly caller: ToolCaller;
}

function entityOptions(
  store: Store,
  admin: PluginAdmin,
  drivers: Pick<DriverNodes, 'options'>,
  request: EntityRequest,
): Promise<PluginOptionPage> {
  const driven = drivers.options(request.pluginId, request.entity, request.query, request.caller);
  if (driven !== undefined) {
    return driven;
  }
  const row = store.plugins.byId(request.pluginId);
  const declared = row.manifest.contributes.automation.entities.find(
    (entity) => entity.id === request.entity,
  );
  if (declared === undefined) {
    throw new ApiError('not_found', `${row.manifest.name} has no entity named ${request.entity}.`);
  }
  if (row.source !== 'builtin' && row.tool_switches[declared.options] === false) {
    return Promise.resolve({
      state: 'unavailable',
      message: `${row.manifest.name} has its ${declared.options} tool switched off.`,
    });
  }
  return admin.choices(request.pluginId, declared.options, request.query, request.caller);
}

export interface EntityOptionsContext {
  readonly store: Store;
  readonly hub: { readonly automationKinds: Pick<PluginKindCatalog, 'driverNodes'> };
}

export const automationEntityOptionsRoutes = (context: EntityOptionsContext, admin: PluginAdmin) =>
  ({
    readAutomationEntityOptions: bound(E.readAutomationEntityOptions, ({ params, query, caller }) =>
      entityOptions(context.store, admin, context.hub.automationKinds.driverNodes, {
        pluginId: params.pluginId,
        entity: params.entity,
        query,
        caller: toolCallerOf(context.store, caller),
      }),
    ),
  }) as const;
