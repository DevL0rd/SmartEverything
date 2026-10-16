import {
  admitExecutionTarget,
  admitNativeExecutionTarget,
  currentExecutionAuthority,
  selectedExecutionDevice,
} from '../assistant/execution-authority';
import { operationNamed } from '../extensions/mcp/tools/operation-names';
import { z } from 'zod';
import type { Store } from '../store/store';
import { TARGET, targeted } from '../extensions/mcp/tools/targets';
import { CALL_TOOL_INPUT } from '../ai-tools/tool-discovery';
import {
  SCENE_ACTIONS,
  MCP_TOOLS,
  MCP_ROUTES,
  isMcpToolName,
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
]);
const CONTROL = new Set([
  'control_devices',
  'sendCommand',
  'sendCommands',
  'runScene',
  'run_scene',
  'createScene',
  'updateScene',
  'createSchedule',
  'updateSchedule',
  'runSchedule',
  'schedule',
  'createScheduled',
  'runAutomation',
  'createAutomation',
  'updateAutomation',
]);
export class ServerToolPolicy {
  private readonly expanding = new Set<string>();
  constructor(
    private readonly store: Store,
    private readonly localComputer: (id: string) => boolean,
  ) {}
  refusal(name: string, args: Readonly<Record<string, unknown>>): string | undefined {
    if (name === 'call_tool') {
      const call = CALL_TOOL_INPUT.parse(args);
      return this.refusal(call.name, call.arguments);
    }
    if (name === 'call_operation') {
      const operation = operationNamed(z.string().parse(args['operation']));
      if (API_ENDPOINTS[operation].path.startsWith('/api/claude/'))
        return 'Hub conversations cannot access the hub-local native desktop session bridge.';
      return this.refusalFor(
        mcpOperationArea(API_ENDPOINTS[operation]),
        operation,
        RECORD.parse(args['arguments'] ?? {}),
      );
    }
    if (hubNativeBridge(name))
      return 'Hub conversations cannot access the hub-local native desktop session bridge.';
    return this.refusalFor(MCP_TOOLS.find((tool) => tool.name === name)?.area, name, args);
  }
  private refusalFor(
    area: string | undefined,
    name: string,
    args: Readonly<Record<string, unknown>>,
  ): string | undefined {
    if (area === 'assistant') this.assistantTarget(name, args);
    const operation = mcpToolOperation(name) ?? name;
    const system = area === 'computers' || area === 'claude';
    return system || CONTROL.has(operation)
      ? this.inspect(args, CONTROL.has(operation))
      : undefined;
  }
  private assistantTarget(name: string, args: Readonly<Record<string, unknown>>): void {
    const authority = currentExecutionAuthority();
    if (authority === undefined) return;
    const operation = mcpToolOperation(name);
    if (MANAGED_RESOURCE_OPERATIONS.has(operation ?? name)) return;
    if (operation !== undefined && API_ENDPOINTS[operation].method === 'GET') return;
    this.targets(args, authority);
  }
  private targets(value: unknown, authority: Parameters<typeof admitExecutionTarget>[2]): void {
    const record = RECORD.safeParse(value);
    if (!record.success) return;
    for (const key of ['chatId', 'chat_id', 'parentId', 'parent_id']) {
      const id = record.data[key];
      if (typeof id === 'string')
        admitExecutionTarget(this.store, this.store.aiChats.chat(id), authority);
    }
    this.engineTarget(record.data['engine']);
    for (const item of Object.values(record.data)) this.targets(item, authority);
  }
  private engineTarget(engine: unknown): void {
    if (engine !== undefined) {
      const selection = z
        .object({
          kind: z.string(),
          device_id: z.string().optional(),
          execution_target: z
            .object({ kind: z.string(), device_id: z.string().optional() })
            .optional(),
        })
        .parse(engine);
      const device =
        selection.kind === 'dsh' ? selection.execution_target?.device_id : selection.device_id;
      this.nativeEngineTarget(selection.kind, device);
      if (selection.kind === 'claude' || selection.kind === 'codex') {
        if (selection.device_id === undefined || this.localComputer(selection.device_id))
          throw new Error('Hub-originated work cannot acquire hub-local native engine access.');
      }
    }
  }
  private nativeEngineTarget(kind: string, device: string | undefined): void {
    if (kind !== 'dsh' || device === undefined) return;
    const authority = currentExecutionAuthority();
    if (authority === undefined)
      throw new Error('Native device selection requires initiating authority.');
    admitNativeExecutionTarget(this.store, device, authority);
  }
  private inspect(value: unknown, selectors: boolean): string | undefined {
    if (typeof value === 'string') return this.computerRefusal(value);
    if (Array.isArray(value)) return this.values(value, selectors);
    const record = RECORD.safeParse(value);
    if (!record.success) return undefined;
    const expanded = this.expanded(record.data, selectors);
    if (expanded !== undefined) return expanded;
    if (selectors && this.localSelector(record.data))
      return 'Computer selectors require the authorized selected execution target.';
    return this.values(Object.values(record.data), selectors);
  }
  private computerRefusal(id: string): string | undefined {
    const device = this.store.devices.find(id);
    if (device?.kind !== 'computer') return undefined;
    return this.selectedComputer(device.id)
      ? undefined
      : 'Computer tools require the authorized selected execution target.';
  }
  private localSelector(record: Readonly<Record<string, unknown>>): boolean {
    const target = TARGET.safeParse(record);
    return (
      target.success &&
      targeted(this.store, target.data).some(
        (item) => item.device.kind === 'computer' && !this.selectedComputer(item.device.id),
      )
    );
  }
  private selectedComputer(id: string): boolean {
    const authority = currentExecutionAuthority();
    return authority !== undefined && selectedExecutionDevice(this.store, id, authority);
  }
  private expanded(
    record: Readonly<Record<string, unknown>>,
    selectors: boolean,
  ): string | undefined {
    const scene = record['sceneId'];
    if (typeof scene === 'string')
      return this.expand(
        'scene:' + scene,
        () => SCENE_ACTIONS.parse(this.store.scenes.byId(scene).actions),
        selectors,
      );
    const schedule = record['scheduleId'];
    if (typeof schedule === 'string')
      return this.expand(
        'schedule:' + schedule,
        () => this.store.schedules.byId(schedule).steps,
        selectors,
      );
    const automation = record['automationId'];
    if (typeof automation === 'string')
      return this.expand(
        'automation:' + automation,
        () => this.store.automations.byId(automation).definition['actions'],
        selectors,
      );
    const tool = record['tool'];
    if (typeof tool === 'string' && record['args'] !== undefined)
      return this.refusal(tool, RECORD.parse(record['args']));
    return undefined;
  }
  private expand(id: string, read: () => unknown, selectors: boolean): string | undefined {
    if (this.expanding.has(id)) return 'A scheduled action cannot recursively invoke itself.';
    this.expanding.add(id);
    try {
      return this.inspect(read(), selectors);
    } finally {
      this.expanding.delete(id);
    }
  }
  private values(values: readonly unknown[], selectors: boolean): string | undefined {
    for (const item of values) {
      const refusal = this.inspect(item, selectors);
      if (refusal !== undefined) return refusal;
    }
    return undefined;
  }
}

function hubNativeBridge(name: string): boolean {
  const route = isMcpToolName(name) ? MCP_ROUTES.get(name) : undefined;
  const parts =
    route === undefined
      ? [name]
      : 'part' in route
        ? [route.part]
        : 'parts' in route
          ? Object.values(route.parts)
          : [];
  return parts.some((part) => {
    const operation = mcpToolOperation(part);
    return operation !== undefined && API_ENDPOINTS[operation].path.startsWith('/api/claude/');
  });
}
