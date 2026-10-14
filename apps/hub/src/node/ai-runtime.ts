import type { NodeHubTransport } from '../client-network/node-transport';
import { createHash } from 'node:crypto';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import {
  COMPUTER_RUNTIME_EXECUTE,
  COMPUTER_RUNTIME_REQUEST,
  COMPUTER_RUNTIME_REPLY,
  NODE_AI_FRAME_V2,
  COMPUTER_RUNTIME_READ,
  COMPUTER_AI_CAPABILITIES,
  type ComputerRuntimeRequest,
  type ComputerRuntimeReply,
  type ComputerRuntimeSettings,
  type ComputerAiRuntime,
  type HubAiControl,
  type HubAiControlV2,
  type NodeAiFrameV2,
  type NodeHello,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerAiHost } from '../computers/ai-host';
import {
  adaptClaudeHost,
  type ComputerRuntimeHost,
  type ComputerRuntimeHostEvent,
} from '../computers/runtime-host';
import { NodeAiLink } from './ai-link';
type ReplyResult = Extract<NodeAiFrameV2, { type: 'reply' }>['result'];
interface RequestReceipt {
  readonly signature: string;
  readonly result: Promise<ReplyResult>;
}
export interface NodeAiRuntimeOptions {
  readonly hubUrl: string;
  readonly token: string;
  readonly deviceId: string;
  readonly hello: NodeHello;
  readonly log: Logger;
  readonly transport?: NodeHubTransport;
  readonly createHost: () => Promise<ComputerAiHost>;
  readonly createRuntimeHosts?: () => Promise<readonly ComputerRuntimeHost[]>;
  readonly runtimes?: readonly ComputerAiRuntime[];
  readonly changed: (connected: boolean) => void;
}
export class NodeAiRuntime {
  private readonly link: NodeAiLink;
  private readonly hosts = new Map<ComputerAiRuntime, ComputerRuntimeHost>();
  private readonly subscriptions: (() => void)[] = [];
  private generation: string | null = null;
  private v2 = false;
  private initializing: Promise<void> = Promise.resolve();
  private readonly receipts = new Map<string, RequestReceipt>();
  constructor(private readonly options: NodeAiRuntimeOptions) {
    this.link = new NodeAiLink({
      ...options,
      received: (frame): void => {
        void this.received(frame).catch((cause: unknown) => {
          options.log.error('node.frame_failed', cause);
        });
      },
      disconnected: (): void => {
        this.disconnect();
      },
    });
  }
  start(): void {
    this.link.start();
  }
  stop(): void {
    this.link.stop();
    this.disconnect();
  }
  private async received(frame: HubAiControl | HubAiControlV2): Promise<void> {
    if (frame.type === 'welcome') {
      this.initializing = this.initializing
        .catch((): void => undefined)
        .then(() => this.welcome(frame));
      await this.initializing;
      return;
    }
    await this.initializing;
    if (this.generation !== frame.generation) return;
    const request = COMPUTER_RUNTIME_REQUEST.parse(
      'runtime' in frame.request ? frame.request : { runtime: 'claude', request: frame.request },
    );
    await this.answerRequest(frame.id, frame.generation, request);
  }
  private async answerRequest(
    id: string,
    generation: string,
    request: ComputerRuntimeRequest,
  ): Promise<void> {
    const signature = createHash('sha256').update(canonicalRuntimeInput(request)).digest('hex');
    const known = this.receipts.get(id);
    if (known !== undefined && known.signature !== signature) {
      this.reply(
        id,
        generation,
        failure(
          'request_collision',
          'The request ID was already used with different runtime or input.',
        ),
      );
      return;
    }
    if (known === undefined && !COMPUTER_RUNTIME_EXECUTE.safeParse(request).success) {
      this.reply(id, generation, await this.request(request));
      return;
    }
    if (known === undefined && this.receipts.size >= 10_000) {
      this.reply(
        id,
        generation,
        failure(
          'receipt_capacity',
          'The node receipt capacity is reached; restart before new mutations.',
        ),
      );
      return;
    }
    const result = known?.result ?? this.request(request);
    if (known === undefined)
      this.receipts.set(id, {
        signature,
        result: result.then((reply) =>
          JSON.stringify(reply).length <= 64_000
            ? reply
            : failure(
                'already_completed',
                'This mutation already completed; its large result was not retained and was not replayed.',
              ),
        ),
      });
    this.reply(id, generation, await result);
  }
  private async welcome(
    frame: Extract<HubAiControl | HubAiControlV2, { type: 'welcome' }>,
  ): Promise<void> {
    this.disconnect();
    this.generation = frame.generation;
    this.v2 = 'runtimes' in frame;
    const created =
      this.options.createRuntimeHosts === undefined
        ? [adaptClaudeHost(await this.options.createHost())]
        : await this.options.createRuntimeHosts();
    if (this.generation !== frame.generation) {
      for (const host of created) host.stop();
      return;
    }
    const settings: readonly ComputerRuntimeSettings[] =
      'runtimes' in frame ? frame.runtimes : [{ runtime: 'claude', settings: frame.settings }];
    try {
      await this.register(created, settings, frame.generation);
    } catch (cause) {
      for (const host of created) host.stop();
      this.disconnect();
      throw cause;
    }
    if (this.generation === frame.generation) this.options.changed(true);
  }
  private async register(
    created: readonly ComputerRuntimeHost[],
    settings: readonly ComputerRuntimeSettings[],
    generation: string,
  ): Promise<void> {
    for (const host of created) {
      const runtime = settings.find((entry) => entry.runtime === host.runtime);
      if (runtime === undefined) {
        host.stop();
        continue;
      }
      if (this.hosts.has(host.runtime))
        throw new NodeRuntimeError('A node registered a duplicate runtime host.');
      this.hosts.set(host.runtime, host);
      this.subscriptions.push(
        host.onEvent((event) => {
          if (this.generation === generation && this.hosts.get(host.runtime) === host)
            this.event(event);
        }),
      );
      await host.execute(
        COMPUTER_RUNTIME_EXECUTE.parse({
          runtime: runtime.runtime,
          request: { operation: 'configure', settings: runtime.settings },
        }),
      );
      if (this.generation !== generation) {
        for (const candidate of created) candidate.stop();
        return;
      }
    }
  }
  private async request(request: ComputerRuntimeRequest): Promise<ReplyResult> {
    try {
      const host = this.hosts.get(request.runtime);
      if (host === undefined)
        throw new NodeRuntimeError(
          'The selected runtime is unavailable on this computer connection.',
        );
      const execute = COMPUTER_RUNTIME_EXECUTE.safeParse(request);
      const reply: ComputerRuntimeReply = COMPUTER_RUNTIME_REPLY.parse(
        execute.success
          ? await host.execute(execute.data)
          : await host.read(COMPUTER_RUNTIME_READ.parse(request)),
      );
      if (reply.runtime !== request.runtime || reply.reply.operation !== request.request.operation)
        throw new NodeRuntimeError('The runtime replied to a different operation.');
      return { ok: true, reply };
    } catch (cause) {
      return failure(
        cause instanceof Error ? cause.name : 'NodeExecutionError',
        cause instanceof Error ? cause.message.slice(0, 2000) : 'The computer operation failed.',
      );
    }
  }
  private reply(id: string, generation: string, result: ReplyResult): void {
    if (this.generation !== generation) return;
    const bound = { type: 'reply', id, generation, device_id: this.options.deviceId } as const;
    if (this.v2) {
      this.link.send({ ...bound, result });
      return;
    }
    if (!result.ok) {
      this.link.send({ ...bound, result });
      return;
    }
    if (result.reply.runtime !== 'claude') return;
    this.link.send({ ...bound, result: { ok: true, reply: result.reply.reply } });
  }
  private event(event: ComputerRuntimeHostEvent): void {
    if (this.generation === null) return;
    const bound = { device_id: this.options.deviceId, generation: this.generation };
    if (this.v2) {
      if (event.kind === 'capabilities')
        this.link.send({
          ...bound,
          type: 'capabilities',
          runtime: event.runtime,
          capabilities: event.capabilities,
        });
      else if (event.kind === 'native')
        this.link.send(
          NODE_AI_FRAME_V2.parse({
            ...bound,
            type: 'native_event',
            payload: { runtime: event.runtime, notice: event.notice },
          }),
        );
      else
        this.link.send(
          NODE_AI_FRAME_V2.parse({
            ...bound,
            type: 'provider_event',
            payload: { runtime: event.runtime, event: event.event },
          }),
        );
      return;
    }
    if (event.runtime !== 'claude') return;
    if (event.kind === 'capabilities') {
      const { runtime_version, operations, settings, control_reason, provider_reason } =
        event.capabilities;
      this.link.send({
        ...bound,
        type: 'capabilities',
        capabilities: COMPUTER_AI_CAPABILITIES.parse({
          runtime_version,
          operations,
          settings,
          control_reason,
          provider_reason,
        }),
      });
    } else if (event.kind === 'native')
      this.link.send({ ...bound, type: 'native_event', notice: event.notice });
    else this.link.send({ ...bound, type: 'provider_event', event: event.event });
  }
  private disconnect(): void {
    this.generation = null;
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.length = 0;
    for (const host of this.hosts.values()) host.stop();
    this.hosts.clear();
    this.options.changed(false);
  }
}
function failure(code: string, message: string): ReplyResult {
  return { ok: false, failure: { code, message } };
}
class NodeRuntimeError extends Error {
  override readonly name = 'NodeRuntimeError';
}
