import type { ToolHub } from '../../ai-tools/tool-hub';
import { callTool, type JsonObject, type ToolOrigin } from './tool';

export interface IrSendRequest {
  readonly remote: string;
  readonly button: string;
  readonly profileId: string;
}

export async function sendIrButton(
  tools: Pick<ToolHub, 'check' | 'call'>,
  request: IrSendRequest,
  origin: ToolOrigin,
): Promise<JsonObject> {
  return callTool(
    tools,
    {
      profileId: request.profileId,
      tool: 'press_remote_button',
      args: { remote: request.remote, button: request.button },
    },
    origin,
  );
}
