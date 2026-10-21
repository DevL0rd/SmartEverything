import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { ToolHub } from '../../ai-tools/tool-hub';
import { callTool, type ToolOrigin } from './tool';

export interface DeviceOperationRequest {
  readonly operation: string;
  readonly args: Readonly<Record<string, JsonValue>>;
  readonly profileId: string;
  readonly personId?: string;
}

export async function runDeviceOperation(
  tools: Pick<ToolHub, 'check' | 'call'>,
  request: DeviceOperationRequest,
  origin: ToolOrigin,
): Promise<JsonValue> {
  const response = await callTool(
    tools,
    {
      profileId: request.profileId,
      tool: 'operation_call',
      args: {
        operation: request.operation,
        arguments: request.args,
        ...(request.personId === undefined ? {} : { personId: request.personId }),
      },
    },
    origin,
  );
  return JSON_VALUE.parse(response['result'] ?? null);
}
