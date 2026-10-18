import {
  admitExecutionTarget,
  currentExecutionAuthority,
  requireOwnerExecution,
} from '../assistant/turn-authority';
import { operationNamed } from '../extensions/mcp/tools/operation-names';
import { NATIVE_BRIDGE_REFUSAL, nativeBridgeOperation, reachesNativeBridge } from './native-bridge';
import { z } from 'zod';
import type { Store } from '../store/store';
import type { ConversationAuthority } from './authority-contract';
import { CALL_TOOL_INPUT } from '../ai-tools/tool-discovery';
import {
  ApiError,
  MCP_TOOLS,
  mcpToolOperation,
  API_ENDPOINTS,
  mcpOperationArea,
} from '@smarteverything/domain';

const RECORD = z.record(z.string(), z.unknown());
const MANAGED_RESOURCE_OPERATIONS = new Set([
  'readAiProjectFiles',
  'writeAiProjectFiles',
  'removeAiProjectFiles',
  'publishAiHtmlPreview',
  'publishAiProjectPreview',
  'revokeAiPreview',
  'readEmbeddedBrowser',
  'editEmbeddedBrowser',
  'clearPreviewWebsiteData',
  'readPreviewLogs',
  'searchPreviewLogs',
  'capturePreviewViewport',
  'readPreviewErrorRules',
  'ignorePreviewError',
  'restorePreviewError',
]);
const ENGINE_SELECTION = z.object({
  kind: z.string(),
  device_id: z.string().optional(),
  execution_target: z.object({ kind: z.string(), device_id: z.string().optional() }).optional(),
});

export class HubLocalBoundary {
  constructor(private readonly store: Store) {}
  refusal(name: string, args: Readonly<Record<string, unknown>>): string | undefined {
    if (name === 'call_tool') {
      const call = CALL_TOOL_INPUT.parse(args);
      return this.refusal(call.name, call.arguments);
    }
    if (name === 'call_operation') {
      const operation = operationNamed(z.string().parse(args['operation']));
      if (nativeBridgeOperation(operation)) return NATIVE_BRIDGE_REFUSAL;
      this.assistantTarget(
        mcpOperationArea(API_ENDPOINTS[operation]),
        operation,
        RECORD.parse(args['arguments'] ?? {}),
      );
      return undefined;
    }
    if (reachesNativeBridge(name)) return NATIVE_BRIDGE_REFUSAL;
    this.assistantTarget(MCP_TOOLS.find((tool) => tool.name === name)?.area, name, args);
    return undefined;
  }
  private assistantTarget(
    area: string | undefined,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): void {
    const authority = currentExecutionAuthority();
    if (area !== 'assistant' || authority === undefined) return;
    const operation = mcpToolOperation(name);
    if (MANAGED_RESOURCE_OPERATIONS.has(operation ?? name)) return;
    if (operation !== undefined && API_ENDPOINTS[operation].method === 'GET') return;
    this.targets(args, authority);
  }
  private targets(value: unknown, authority: ConversationAuthority): void {
    const record = RECORD.safeParse(value);
    if (!record.success) return;
    for (const key of ['chatId', 'chat_id', 'parentId', 'parent_id']) {
      const id = record.data[key];
      if (typeof id === 'string')
        admitExecutionTarget(this.store, this.store.aiChats.chat(id), authority);
    }
    if (record.data['engine'] !== undefined) this.engineTarget(record.data['engine']);
    for (const item of Object.values(record.data)) this.targets(item, authority);
  }
  private engineTarget(engine: unknown): void {
    const selection = ENGINE_SELECTION.parse(engine);
    if (selection.kind === 'dsh') {
      this.nativeDevice(selection.execution_target?.device_id);
      return;
    }
    if (selection.kind !== 'claude' && selection.kind !== 'codex') return;
    if (selection.device_id === undefined || this.store.computerAi.isLocal(selection.device_id))
      throw new ApiError(
        'forbidden',
        'Hub conversations cannot start Claude or Codex on the computer the hub itself runs on; pick another computer.',
      );
  }
  private nativeDevice(device: string | undefined): void {
    if (device === undefined) return;
    const authority = currentExecutionAuthority();
    if (authority === undefined)
      throw new ApiError('forbidden', 'Choosing a native device needs an initiating conversation.');
    requireOwnerExecution(authority);
  }
}
