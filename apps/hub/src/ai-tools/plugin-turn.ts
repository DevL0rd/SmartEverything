import {
  ApiError,
  pluginTurnOperationReason,
  type EndpointName,
  type PluginOrigin,
  type PluginRequester,
} from '@smarteverything/domain';

export class PluginTurnRefusedError extends ApiError {
  constructor(what: string, reason: string) {
    super('forbidden', `${what} is not available to a plugin’s request: ${reason}`);
  }
}

export function operationRefusal(name: EndpointName): PluginTurnRefusedError | null {
  const reason = pluginTurnOperationReason(name);
  return reason === null ? null : new PluginTurnRefusedError(name, reason);
}

class UnnamedPluginTurnError extends Error {
  override readonly name = 'UnnamedPluginTurnError';

  constructor(requester: PluginRequester) {
    super(
      `A request from a plugin (${requester}) arrived without the plugin’s id, so what it saves cannot say where it came from.`,
    );
  }
}

export interface PluginTurnFields {
  readonly pluginRequester?: PluginRequester | undefined;
  readonly pluginId?: string | undefined;
}

export function pluginOriginOf(who: PluginTurnFields): PluginOrigin | null {
  if (who.pluginRequester === undefined) {
    return null;
  }
  if (who.pluginId === undefined) {
    throw new UnnamedPluginTurnError(who.pluginRequester);
  }
  return { plugin_id: who.pluginId, requester: who.pluginRequester };
}

export function limitsOf(
  requester: PluginRequester | undefined,
  pluginId: string | null | undefined,
): { readonly pluginRequester?: PluginRequester; readonly pluginId?: string } {
  if (requester !== 'unlisted') {
    return {};
  }
  return {
    pluginRequester: requester,
    ...(pluginId === null || pluginId === undefined ? {} : { pluginId }),
  };
}
