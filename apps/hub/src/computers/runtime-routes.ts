import type { Store } from '../store/store';
import {
  API_ENDPOINTS,
  ApiError,
  COMPUTER_RUNTIME_REPLY,
  type ComputerRuntimeTarget,
} from '@smarteverything/domain';
import { bound, type RouteOf, type RouteTable } from '../server/router';
import type { ComputerAiDirectory } from './ai-directory';
import { computerMcpPolicyRoutes } from './mcp-policy-routes';
import { assertPublicRuntimeRequest } from './runtime-access';
import { externalChatRetired } from './external-chat';

function target(params: {
  readonly deviceId: string;
  readonly runtime: 'claude' | 'codex';
}): ComputerRuntimeTarget {
  return { device_id: params.deviceId, runtime: params.runtime };
}
export function computerRuntimeRoutes(
  directory: ComputerAiDirectory,
  store: Store,
): Pick<
  RouteTable,
  | 'readComputerNativeMcpPolicy'
  | 'updateComputerNativeMcpPolicy'
  | 'updateAiRuntimeEnginePreference'
  | 'readComputerRuntime'
  | 'updateComputerRuntime'
  | 'readComputerRuntimeModels'
  | 'readComputerRuntimeState'
  | 'executeComputerRuntime'
  | 'readComputerRuntimeReceipt'
> {
  return {
    ...computerMcpPolicyRoutes(directory, store),
    updateAiRuntimeEnginePreference: preferenceRoute(directory, store),
    readComputerRuntime: bound(API_ENDPOINTS.readComputerRuntime, ({ params }) =>
      directory.runtimeStatus(target(params)),
    ),
    updateComputerRuntime: bound(API_ENDPOINTS.updateComputerRuntime, ({ params, body }) =>
      directory.updateRuntime(target(params), body),
    ),
    readComputerRuntimeModels: bound(API_ENDPOINTS.readComputerRuntimeModels, ({ params }) =>
      directory.runtimeModels(target(params)),
    ),
    readComputerRuntimeState: bound(API_ENDPOINTS.readComputerRuntimeState, ({ params, body }) => {
      assertPublicRuntimeRequest(body);
      return directory.requestRuntime(target(params), body, COMPUTER_RUNTIME_REPLY);
    }),
    executeComputerRuntime: bound(
      API_ENDPOINTS.executeComputerRuntime,
      ({ params, body, caller }) => {
        assertPublicRuntimeRequest(body);
        return directory.nativeRuntimeRequest(target(params), body, COMPUTER_RUNTIME_REPLY, caller);
      },
    ),
    readComputerRuntimeReceipt: bound(
      API_ENDPOINTS.readComputerRuntimeReceipt,
      externalChatRetired,
    ),
  };
}

function preferenceRoute(
  directory: ComputerAiDirectory,
  store: Store,
): RouteOf<'updateAiRuntimeEnginePreference'> {
  return bound(API_ENDPOINTS.updateAiRuntimeEnginePreference, async ({ params, body }) => {
    const models = await directory.runtimeModels({
      device_id: body.device_id,
      runtime: params.runtime,
    });
    if (!models.some((model) => model.id === params.modelId))
      throw new ApiError('invalid_request', 'The selected runtime has not reported this model.');
    return store.aiRuntimeProvider.prefer(params.runtime, params.modelId, body.device_id);
  });
}
