import { z } from 'zod';
import {
  JSON_VALUE,
  CODEX_AI_SETTINGS,
  CODEX_AI_READ,
  CODEX_AI_EXECUTE,
  CODEX_AI_REPLY,
  COMPUTER_RUNTIME_CAPABILITIES,
  DEFAULT_CODEX_AI_SETTINGS,
  type CodexAiSettings,
  type ComputerRuntimeRead,
  type ComputerRuntimeExecute,
  type ComputerRuntimeReply,
  type ComputerRuntimeCapabilities,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerRuntimeHost, ComputerRuntimeHostEvent } from '../computers/runtime-host';
import { CodexProvider } from './provider';
import { CodexNative } from './native';
import { CodexRuntimeError } from './errors';
import type { CodexProcessOptions } from './process';
import type { CodexNativeGrantResolver } from './native-grant';
import { CODEX_SKILLS_CAPABILITY_REVISION } from './provider-commands';
export interface CodexHostOptions extends CodexProcessOptions {
  readonly deviceId: string;
  readonly dataDirectory: string;
  readonly settings?: CodexAiSettings;
  readonly nativeMcpGrant?: CodexNativeGrantResolver;
  readonly log: Logger;
  readonly now?: () => string;
}
const NATIVE_OPERATIONS = [
  'models',
  'sessions',
  'session',
  'thread',
  'usage',
  'prompts',
  'start',
  'resume',
  'send',
  'steer',
  'interrupt',
  'rename',
  'fork',
  'archive',
  'unarchive',
  'delete',
  'answer',
] as const;
const PROVIDER_OPERATIONS = [
  'models',
  'provider_metadata',
  'provider_read',
  'provider_start',
  'provider_control',
  'provider_interrupt',
  'provider_answer',
  'provider_tool_result',
] as const;
class CodexHost implements ComputerRuntimeHost {
  readonly runtime = 'codex';
  private readonly listeners = new Set<(event: ComputerRuntimeHostEvent) => void>();
  private readonly provider: CodexProvider;
  private readonly native: CodexNative;
  private settings: CodexAiSettings;
  private controlReason: string | null = 'The owning Codex control socket has not initialized.';
  private providerReason: string | null = 'Managed ChatGPT Codex sign-in has not been verified.';
  private stopped = false;
  private readonly nativeMcpConfigured: boolean;
  constructor(options: CodexHostOptions) {
    this.nativeMcpConfigured = options.nativeMcpGrant !== undefined;
    this.settings = CODEX_AI_SETTINGS.parse(options.settings ?? DEFAULT_CODEX_AI_SETTINGS);
    this.provider = new CodexProvider({
      ...options,
      now: options.now ?? ((): string => new Date().toISOString()),
      publish: (event): void => {
        this.publish({ kind: 'provider', runtime: 'codex', event });
      },
      changed: (reason): void => {
        this.providerReason = reason;
        this.changed();
      },
    });
    this.native = new CodexNative({
      ...options,
      prompt: (prompt): void => {
        this.publish({
          kind: 'native',
          runtime: 'codex',
          notice: { type: 'codex_prompt', prompt },
        });
      },
      changed: (reason): void => {
        this.controlReason = reason;
        this.changed();
      },
      notification: (method, params): void => {
        const session = z.string().max(200).parse(params['threadId']);
        this.publish({
          kind: 'native',
          runtime: 'codex',
          notice: { type: 'codex_session', session, payload: { method, ...params } },
        });
      },
    });
    this.provider.configure(this.settings.provider.enabled, this.settings.provider.options);
    this.native.configure(this.settings);
  }
  async read(envelope: ComputerRuntimeRead): Promise<ComputerRuntimeReply> {
    this.check(envelope.runtime);
    if (envelope.runtime !== 'codex')
      throw new CodexRuntimeError('read', 'The Codex host requires a Codex envelope.');
    const request = CODEX_AI_READ.parse(envelope.request);
    let value: unknown;
    if (request.operation === 'status')
      value = {
        capabilities: this.capabilities(),
        native: {
          connected: this.controlReason === null,
          reason: this.controlReason,
          mcp_grant_configured: this.nativeMcpConfigured,
          mcp_available: this.nativeMcpConfigured ? null : false,
          mcp_reason: this.nativeMcpConfigured
            ? 'Scoped MCP is configured on native start/resume; connection health is not verified.'
            : 'No computer/runtime-scoped native MCP grant resolver is configured on this computer.',
        },
      };
    else if (request.operation === 'models')
      value = this.settings.provider.enabled
        ? await this.provider.models()
        : await this.native.models();
    else if (isProviderRead(request)) value = await this.provider.read(request);
    else return { runtime: 'codex', reply: await this.native.read(request) };
    return {
      runtime: 'codex',
      reply: CODEX_AI_REPLY.parse({ operation: request.operation, value }),
    };
  }
  async execute(envelope: ComputerRuntimeExecute): Promise<ComputerRuntimeReply> {
    this.check(envelope.runtime);
    if (envelope.runtime !== 'codex')
      throw new CodexRuntimeError('execute', 'The Codex host requires a Codex envelope.');
    const request = CODEX_AI_EXECUTE.parse(envelope.request);
    if (request.operation === 'configure') {
      this.settings = request.settings;
      this.provider.configure(request.settings.provider.enabled, request.settings.provider.options);
      this.native.configure(request.settings);
      await this.initializeEnabled();
      this.changed();
      return { runtime: 'codex', reply: { operation: 'configure', value: this.settings } };
    }
    if (isProviderExecute(request))
      return {
        runtime: 'codex',
        reply: CODEX_AI_REPLY.parse({
          operation: request.operation,
          value: await this.provider.execute(request),
        }),
      };
    const reply = await this.native.execute(request);
    if ('operation_id' in request)
      this.publish({
        kind: 'native',
        runtime: 'codex',
        notice: {
          type: 'codex_operation',
          operation: request.operation_id,
          payload: { reply: JSON_VALUE.parse(reply) },
        },
      });
    return { runtime: 'codex', reply };
  }
  onEvent(listener: (event: ComputerRuntimeHostEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ kind: 'capabilities', runtime: 'codex', capabilities: this.capabilities() });
    return () => this.listeners.delete(listener);
  }
  stop(): void {
    this.stopped = true;
    this.provider.stop();
    this.native.stop();
    this.listeners.clear();
  }
  private async initializeEnabled(): Promise<void> {
    const jobs: {
      readonly capability: 'control' | 'provider';
      readonly promise: Promise<unknown>;
    }[] = [];
    if (this.settings.provider.enabled)
      jobs.push({ capability: 'provider', promise: this.provider.models() });
    if (this.settings.control.enabled)
      jobs.push({ capability: 'control', promise: this.native.connect() });
    const outcomes = await Promise.allSettled(jobs.map((job) => job.promise));
    for (const [index, result] of outcomes.entries())
      if (result.status === 'rejected') {
        const reason =
          result.reason instanceof Error
            ? result.reason.message.slice(0, 2000)
            : 'Codex initialization failed.';
        if (jobs[index]?.capability === 'provider') this.providerReason = reason;
        else this.controlReason = reason;
      }
  }
  private check(runtime: string): void {
    if (runtime !== 'codex' || this.stopped)
      throw new CodexRuntimeError(
        'host',
        'This Codex host is stopped or the request names another runtime.',
      );
  }
  private publish(event: ComputerRuntimeHostEvent): void {
    for (const listener of this.listeners) listener(event);
  }
  private changed(): void {
    if (!this.stopped)
      this.publish({ kind: 'capabilities', runtime: 'codex', capabilities: this.capabilities() });
  }
  private capabilities(): ComputerRuntimeCapabilities {
    const control = this.settings.control.enabled && this.controlReason === null;
    const provider = this.settings.provider.enabled && this.providerReason === null;
    return COMPUTER_RUNTIME_CAPABILITIES.parse({
      runtime_version: control || provider ? '0.162.1' : null,
      capability_revision: CODEX_SKILLS_CAPABILITY_REVISION,
      operations: [
        ...new Set([
          'status',
          'configure',
          'native_operation',
          ...(control ? NATIVE_OPERATIONS : []),
          ...(provider ? PROVIDER_OPERATIONS : []),
        ]),
      ],
      settings: [
        {
          kind: 'enum',
          key: 'approval_policy',
          label: 'Approvals',
          values: ['on-request', 'never'],
        },
      ],
      control_reason: readinessReason(
        this.settings.control.enabled,
        this.controlReason,
        'Codex session control is disabled on this computer.',
      ),
      provider_reason: readinessReason(
        this.settings.provider.enabled,
        this.providerReason,
        'The Codex model provider is disabled on this computer.',
      ),
      authentication: provider ? 'chatgpt' : 'unknown',
      subscription: provider ? 'eligible' : 'unverified',
      input_modalities: this.provider.modalities(),
      local_features: codingFeatures(provider),
    });
  }
}
export function createCodexHost(options: CodexHostOptions): ComputerRuntimeHost {
  return new CodexHost(options);
}

function readinessReason(enabled: boolean, reason: string | null, disabled: string): string | null {
  return enabled ? reason : disabled;
}

function codingFeatures(ready: boolean): ComputerRuntimeCapabilities['local_features'] {
  return ready ? { files: true, commands: true, mcp: true, agents: true } : {};
}

function isProviderRead(
  request: ReturnType<typeof CODEX_AI_READ.parse>,
): request is Extract<ReturnType<typeof CODEX_AI_READ.parse>, { operation: `provider_${string}` }> {
  return request.operation.startsWith('provider_');
}
function isProviderExecute(
  request: ReturnType<typeof CODEX_AI_EXECUTE.parse>,
): request is Extract<
  ReturnType<typeof CODEX_AI_EXECUTE.parse>,
  { operation: `provider_${string}` }
> {
  return request.operation.startsWith('provider_');
}
