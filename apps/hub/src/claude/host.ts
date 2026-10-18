import { join } from 'node:path';
import {
  COMPUTER_AI_SETTINGS,
  COMPUTER_AI_REPLY,
  DEFAULT_COMPUTER_AI_SETTINGS,
  type ComputerAiRead,
  type ComputerAiExecute,
  type ComputerAiReply,
  type ComputerAiSettings,
  type ComputerAiCapabilities,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerAiHost, ComputerAiHostEvent } from '../computers/ai-host';
import type { ClaudeService } from './service';
import type { LinkPlane } from './link-plane';
import type { NativeTools } from './native-tools';
import { ClaudeProviderRuntime } from './provider/runtime';
import { searchProjectFiles } from './provider/file-search';
import { providerDiscoveryReason } from './provider/runtime-reads';
import { CLAUDE_COMMAND_CAPABILITY_REVISION } from './provider/command-catalogue';
import { isProviderCommand, executeProviderCommand } from './provider/host-commands';
import { executeLive, isLiveRequest } from './host-live';
import { ClaudeNotReadyError } from './errors';
import { traceHostCall } from '../node/host-trace';
import { HostLog } from './host-log';
import { claudeCapabilities } from './host-capabilities';
import { NativeOperations, isNativeOperation } from './native-operations';
import { messageOf } from '@smarteverything/logging';
export interface ClaudeHostOptions {
  readonly service: ClaudeService;
  readonly plane: LinkPlane;
  readonly deviceId: string;
  readonly dataDirectory: string;
  readonly log: Logger;
  readonly settings?: ComputerAiSettings;
  readonly executable?: string;
}
class ClaudeHost implements ComputerAiHost {
  readonly nativeCommandRevision = CLAUDE_COMMAND_CAPABILITY_REVISION;
  private readonly listeners = new Set<(event: ComputerAiHostEvent) => void>();
  private readonly provider: ClaudeProviderRuntime;
  private readonly native: NativeTools;
  private readonly operations = new NativeOperations((operation): void => {
    this.publish({ kind: 'native', notice: { type: 'claude_operation', operation } });
  });
  private readonly unsubscribe: () => void;
  private readonly trace: HostLog;
  private settings: ComputerAiSettings;
  private publishedCapabilities: string | null = null;
  private providerReason: string | null =
    'The local official Claude runtime has not yet verified subscription sign-in.';
  constructor(private readonly options: ClaudeHostOptions) {
    this.trace = new HostLog(options.log, options.deviceId);
    this.settings = COMPUTER_AI_SETTINGS.parse(options.settings ?? DEFAULT_COMPUTER_AI_SETTINGS);
    this.provider = new ClaudeProviderRuntime({
      deviceId: options.deviceId,
      directory: join(options.dataDirectory, 'claude'),
      log: options.log,
      publish: (event): void => {
        this.publish({ kind: 'provider', event });
      },
      ...(options.executable === undefined ? {} : { executable: options.executable }),
    });
    this.provider.configure(this.settings.provider.enabled, this.settings.provider.options);
    this.native = options.plane.native;
    options.service.ownSessions(this.provider.ownedSessions());
    this.unsubscribe = options.service.onNotice((notice) => {
      this.publish({ kind: 'native', notice });
    });
  }
  read(request: ComputerAiRead): Promise<ComputerAiReply> {
    return traceHostCall(
      { log: this.options.log, runtime: 'claude' },
      'read',
      request.operation,
      () => this.readRequest(request),
    );
  }
  execute(request: ComputerAiExecute): Promise<ComputerAiReply> {
    return traceHostCall(
      { log: this.options.log, runtime: 'claude' },
      'execute',
      request.operation,
      () => this.executeRequest(request),
    );
  }
  private async readRequest(request: ComputerAiRead): Promise<ComputerAiReply> {
    if (nativeReadRequest(request)) {
      if (request.operation !== 'native_operation') this.controlReady(request.operation);
      return this.nativeRead(request);
    }
    const { service } = this.options;
    switch (request.operation) {
      case 'status':
        return {
          operation: 'status',
          value: { native: await service.status(), capabilities: this.capabilities() },
        };
      case 'models':
        return this.providerRead('models', () => this.provider.models());
      case 'provider_metadata':
        return this.providerRead('provider_metadata', () => this.provider.metadata(request.job_id));
      case 'provider_commands':
        return { operation: request.operation, value: await this.provider.commands(request.scope) };
      case 'provider_files':
        return { operation: request.operation, value: await searchProjectFiles(request) };
      case 'provider_command_receipt':
        return {
          operation: request.operation,
          value: this.provider.commandReceipt(request.scope, request.operation_id),
        };
      case 'provider_read':
        return {
          operation: request.operation,
          value: await this.provider.read(request.job_id, request.query),
        };
    }
  }
  private async executeRequest(request: ComputerAiExecute): Promise<ComputerAiReply> {
    if (nativeExecuteRequest(request)) {
      this.controlReady(request.operation);
      return this.dispatchNative(request);
    }
    if (isProviderCommand(request)) return executeProviderCommand(this.provider, request);
    if (isLiveRequest(request)) return executeLive(this.provider, request);
    switch (request.operation) {
      case 'configure':
        return this.configure(request.settings);
      case 'provider_start':
        return { operation: request.operation, value: await this.provider.start(request.turn) };
      case 'provider_control':
        return {
          operation: request.operation,
          value: await this.provider.control(request.job_id, request.control),
        };
    }
  }
  private dispatchNative(request: NativeExecute): Promise<ComputerAiReply> {
    return isNativeOperation(request)
      ? this.operations.execute(request, () => this.nativeExecute(request))
      : this.nativeExecute(request);
  }
  onEvent(listener: (event: ComputerAiHostEvent) => void): () => void {
    this.listeners.add(listener);
    this.trace.listener('added', this.listeners.size);
    const capabilities = this.capabilities();
    this.publishedCapabilities ??= JSON.stringify(capabilities);
    listener({ kind: 'capabilities', capabilities });
    return () => {
      this.listeners.delete(listener);
      this.trace.listener('removed', this.listeners.size);
    };
  }

  stop(): void {
    this.trace.stopping(this.listeners.size);
    this.operations.stop();
    this.provider.stop();
    this.unsubscribe();
    this.options.service.stop();
    this.options.plane.stop();
    this.listeners.clear();
  }

  private capabilities(): ComputerAiCapabilities {
    return claudeCapabilities(this.settings, this.providerReason);
  }

  private publish(event: ComputerAiHostEvent): void {
    if (event.kind === 'capabilities') {
      const signature = JSON.stringify(event.capabilities);
      if (signature === this.publishedCapabilities) return;
      this.publishedCapabilities = signature;
      this.trace.capabilities(event.capabilities, this.listeners.size);
    }
    for (const listener of this.listeners) {
      listener(event);
    }
  }
  private controlReady(operation: string): void {
    if (!this.settings.control.enabled) {
      throw new ClaudeNotReadyError(
        operation,
        'Claude session control is disabled on this computer.',
      );
    }
  }

  private async configure(raw: ComputerAiSettings): Promise<ComputerAiReply> {
    const previous = this.settings;
    this.settings = COMPUTER_AI_SETTINGS.parse(raw);
    this.trace.settings(this.settings, previous);
    this.provider.configure(this.settings.provider.enabled, this.settings.provider.options);
    this.options.plane.configureControl(this.settings.control.enabled);
    if (!this.settings.control.enabled) {
      this.operations.stop();
      this.options.plane.broker.stop();
      this.options.plane.streams.stop();
    }
    this.publish({ kind: 'capabilities', capabilities: this.capabilities() });
    if (
      this.settings.control.enabled &&
      this.settings.control.auto_link &&
      !previous.control.auto_link
    )
      await this.options.service.installLink();
    return { operation: 'configure', value: this.settings };
  }

  private async providerRead(
    operation: 'models' | 'provider_metadata',
    read: () => Promise<unknown>,
  ): Promise<ComputerAiReply> {
    try {
      const reply = COMPUTER_AI_REPLY.parse({ operation, value: await read() });
      const reason = providerDiscoveryReason(reply);
      if (reason !== this.providerReason) this.trace.reason(operation, reason);
      this.providerReason = reason;
      this.publish({ kind: 'capabilities', capabilities: this.capabilities() });
      return reply;
    } catch (cause) {
      this.trace.discoveryFailed(operation, cause);
      this.providerReason = messageOf(cause).slice(0, 500);
      this.publish({ kind: 'capabilities', capabilities: this.capabilities() });
      throw cause;
    }
  }

  private async nativeRead(
    request: Exclude<
      ComputerAiRead,
      {
        operation:
          | 'status'
          | 'models'
          | 'provider_metadata'
          | 'provider_read'
          | 'provider_commands'
          | 'provider_files'
          | 'provider_command_receipt';
      }
    >,
  ): Promise<ComputerAiReply> {
    const { service } = this.options;
    switch (request.operation) {
      case 'native_operation':
        return { operation: request.operation, value: this.operations.read(request.operation_id) };
      case 'native_tools_list':
        return { operation: request.operation, value: await this.native.list(request.session_id) };
      case 'sessions':
        return { operation: request.operation, value: await service.sessions(request.query) };
      case 'session':
        return { operation: request.operation, value: await service.session(request.session_id) };
      case 'thread':
        return {
          operation: request.operation,
          value: await service.thread(request.session_id, request.query),
        };
      case 'usage':
        return { operation: request.operation, value: await service.usage() };
      case 'prompts':
        return { operation: request.operation, value: service.prompts(request.session_id) };
    }
  }

  private async nativeExecute(
    request: Exclude<
      ComputerAiExecute,
      {
        operation:
          | 'configure'
          | 'provider_command'
          | 'provider_command_dispatch'
          | 'provider_start'
          | 'provider_control'
          | 'provider_interrupt'
          | 'provider_steer'
          | 'provider_adopt'
          | 'provider_answer'
          | 'provider_tool_result';
      }
    >,
  ): Promise<ComputerAiReply> {
    const { service } = this.options;
    switch (request.operation) {
      case 'native_tools_call':
        return {
          operation: request.operation,
          value: await this.native.call(request.session_id, request.name, request.arguments),
        };
      case 'control':
        return {
          operation: request.operation,
          value: await service.control(request.session_id, request.control),
        };
      case 'start':
        return { operation: request.operation, value: await service.startSession(request.start) };
      case 'answer':
        return {
          operation: request.operation,
          value: await service.answer(request.prompt_id, request.answer, request.requester),
        };
      case 'install_link':
        return { operation: request.operation, value: await service.installLink() };
      case 'remove_link':
        return { operation: request.operation, value: await service.removeLink() };
      case 'register_controller':
        return { operation: request.operation, value: await service.registerController() };
      case 'remove_controller':
        return { operation: request.operation, value: await service.removeController() };
    }
  }
}

export function createClaudeHost(options: ClaudeHostOptions): ComputerAiHost {
  return new ClaudeHost(options);
}

type NativeRead = Exclude<
  ComputerAiRead,
  {
    operation:
      | 'status'
      | 'models'
      | 'provider_metadata'
      | 'provider_read'
      | 'provider_commands'
      | 'provider_files'
      | 'provider_command_receipt';
  }
>;
type NativeExecute = Exclude<
  ComputerAiExecute,
  {
    operation:
      | 'configure'
      | 'provider_command'
      | 'provider_command_dispatch'
      | 'provider_start'
      | 'provider_control'
      | 'provider_interrupt'
      | 'provider_steer'
      | 'provider_adopt'
      | 'provider_answer'
      | 'provider_tool_result';
  }
>;
const PROVIDER_READS = new Set([
  'status',
  'models',
  'provider_metadata',
  'provider_read',
  'provider_commands',
  'provider_files',
  'provider_command_receipt',
]);
function nativeReadRequest(request: ComputerAiRead): request is NativeRead {
  return !PROVIDER_READS.has(request.operation);
}
function nativeExecuteRequest(request: ComputerAiExecute): request is NativeExecute {
  return request.operation !== 'configure' && !request.operation.startsWith('provider_');
}
