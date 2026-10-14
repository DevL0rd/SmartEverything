import { API_ENDPOINTS as E, type JsonValue } from '@smarteverything/domain';
import { api } from '../../../api/transport';
import { useNativeAction } from './native-action';

export function useNativeToolCall(
  deviceId: string,
  sessionId: string,
  name: string,
  values: Readonly<Record<string, JsonValue>>,
): ReturnType<typeof useNativeAction<JsonValue, undefined>> {
  return useNativeAction<JsonValue, undefined>({
    deviceId,
    kind: 'native_tools_call',
    scope: `${sessionId}:tool:${name}`,
    send: (_variables, operationId) =>
      api().call(E.callComputerClaudeTool, {
        params: { deviceId, sessionId },
        body: { name, arguments: values, operation_id: operationId },
      }),
  });
}
