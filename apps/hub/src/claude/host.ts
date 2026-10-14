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
import { providerSettings } from './provider/metadata';
import { providerDiscoveryReason } from './provider/runtime-reads';
import { SDK_VERSION } from './provider/options';
import { CLAUDE_COMMAND_CAPABILITY_REVISION } from './provider/command-catalogue';
import { isProviderCommand, executeProviderCommand } from './provider/host-commands';
import { ClaudeNotReadyError } from './errors';
import { NativeOperations, isNativeOperation } from './native-operations';
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
  private settings: ComputerAiSettings;
  private publishedCapabilities: string | null = null;
  private providerReason: string | null =
    'The local official Claude runtime has not yet verified subscription sign-in.';
  constructor(private readonly options: ClaudeHostOptions) {
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
    this.unsubscribe = options.service.onNotice((notice) => {
      this.publish({ kind: 'native', notice });
    });
  }
  async read(request: ComputerAiRead): Promise<ComputerAiReply> {
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
  async execute(request: ComputerAiExecute): Promise<ComputerAiReply> {
    if (nativeExecuteRequest(request)) {
      this.controlReady(request.operation);
      return this.dispatchNative(request);
    }
    if (isProviderCommand(request)) return executeProviderCommand(this.provider, request);
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
      case 'provider_interrupt':
        return {
          operation: request.operation,
          value: { interrupted: await this.provider.interrupt(request.job_id) },
        };
      case 'provider_answer':
        return {
          operation: request.operation,
          value: {
            answered: this.provider.answer(request.job_id, request.prompt_id, request.answer),
          },
        };
      case 'provider_tool_result':
        return {
          operation: request.operation,
          value: {
            delivered: this.provider.toolResult(request.job_id, request.call_id, {
              text: request.text,
              failed: request.failed,
              ...(request.content === undefined ? {} : { content: request.content }),
            }),
          },
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
    const capabilities = this.capabilities();
    this.publishedCapabilities ??= JSON.stringify(capabilities);
    listener({ kind: 'capabilities', capabilities });
    return () => {
      this.listeners.delete(listener);
    };
  }

  stop(): void {
    this.operations.stop();
    this.provider.stop();
    this.unsubscribe();
    this.options.service.stop();
    this.options.plane.stop();
    this.listeners.clear();
  }

  private capabilities(): ComputerAiCapabilities {
    const operations: ComputerAiCapabilities['operations'] = [
      'status',
      'configure',
      'native_operation',
    ];
    if (this.settings.control.enabled) {
      operations.push(
        'native_tools_list',
        'native_tools_call',
        'sessions',
        'session',
        'thread',
        'usage',
        'prompts',
        'install_link',
        'remove_link',
        'answer',
      );
    }
    if (this.settings.provider.enabled) {
      operations.push(
        'models',
        'provider_metadata',
        'provider_read',
        'provider_control',
        'provider_interrupt',
        'provider_answer',
        'provider_tool_result',
      );
      if (this.providerReason === null) operations.push('provider_start');
    }
    return {
      runtime_version: SDK_VERSION,
      managed_projects: { protocol: 1 },
      operations,
      settings: providerSettings(),
      control_reason: this.settings.control.enabled
        ? 'Legacy Desktop controls are retired. Use owned Claude CLI chats; direct tools require an attached CLI session.'
        : 'Claude session control is disabled on this computer.',
      provider_reason: this.settings.provider.enabled
        ? this.providerReason
        : 'The Claude model provider is disabled on this computer.',
    };
  }

  private publish(event: ComputerAiHostEvent): void {
    if (event.kind === 'capabilities') {
      const signature = JSON.stringify(event.capabilities);
      if (signature === this.publishedCapabilities) return;
      this.publishedCapabilities = signature;
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
    this.provider.configure(this.settings.provider.enabled, this.settings.provider.options);
    this.options.plane.configureControl(this.settings.control.enabled);
    if (!this.settings.control.enabled) {
      this.operations.stop();
      this.options.plane.broker.stop();
      this.options.plane.streams.stop();
    }
    if (
      this.settings.control.enabled &&
      this.settings.control.auto_link &&
      !previous.control.auto_link
    )
      await this.options.service.installLink();
    this.publish({ kind: 'capabilities', capabilities: this.capabilities() });
    return { operation: 'configure', value: this.settings };
  }

  private async providerRead(
    operation: 'models' | 'provider_metadata',
    read: () => Promise<unknown>,
  ): Promise<ComputerAiReply> {
    try {
      const reply = COMPUTER_AI_REPLY.parse({ operation, value: await read() });
      this.providerReason = providerDiscoveryReason(reply);
      this.publish({ kind: 'capabilities', capabilities: this.capabilities() });
      return reply;
    } catch (cause) {
      this.providerReason =
        cause instanceof Error
          ? cause.message.slice(0, 500)
          : 'The local Claude runtime could not initialize.';
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
  'provider_command_receipt',
]);
function nativeReadRequest(request: ComputerAiRead): request is NativeRead {
  return !PROVIDER_READS.has(request.operation);
}
function nativeExecuteRequest(request: ComputerAiExecute): request is NativeExecute {
  return request.operation !== 'configure' && !request.operation.startsWith('provider_');
}
