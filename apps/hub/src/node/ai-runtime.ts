import type { NodeHubTransport } from '../client-network/node-transport';
import { createHash } from 'node:crypto';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import {
  COMPUTER_RUNTIME_EXECUTE,
  COMPUTER_RUNTIME_REPLY,
  NODE_RUNTIME_FRAME,
  COMPUTER_RUNTIME_READ,
  type ApiErrorCode,
  type ComputerRuntimeRequest,
  type ComputerRuntimeReply,
  type ComputerRuntimeSettings,
  type ComputerAiRuntime,
  type HubRuntimeControl,
  type NodeRuntimeFrame,
  type NodeHello,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ComputerRuntimeHost, ComputerRuntimeHostEvent } from '../computers/runtime-host';
import { apiErrorFor } from '../server/errors';
import { NodeAiLink, type HubSocketFrame } from './ai-link';
import { NodeComputerChannel } from './computer-channel';
import type { ComputerNode } from './computer-node';
import type { NodeLink } from './link';
import { background, messageOf } from '@smarteverything/logging';
import { trimOldest } from '../trim-oldest';
const KEPT_RECEIPTS = 1_000;
type ReplyResult = Extract<NodeRuntimeFrame, { type: 'reply' }>['result'];
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
  readonly createRuntimeHosts: () => Promise<readonly ComputerRuntimeHost[]>;
  readonly createComputer: (link: NodeLink) => ComputerNode | null;
  readonly runtimes?: readonly ComputerAiRuntime[];
  readonly changed: (connected: boolean) => void;
}
export class NodeAiRuntime {
  private readonly link: NodeAiLink;
  private readonly computer: NodeComputerChannel;
  private created: Promise<readonly ComputerRuntimeHost[]> | null = null;
  private readonly hosts = new Map<ComputerAiRuntime, ComputerRuntimeHost>();
  private readonly subscriptions: (() => void)[] = [];
  private generation: string | null = null;
  private initializing: Promise<void> = Promise.resolve();
  private readonly receipts = new Map<string, RequestReceipt>();
  constructor(private readonly options: NodeAiRuntimeOptions) {
    this.computer = new NodeComputerChannel({
      create: options.createComputer,
      send: (frame): void => {
        this.link.sendComputer(frame);
      },
    });
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
    background(
      this.created?.then(
        (hosts) => {
          for (const host of hosts) host.stop();
        },
        () => undefined,
      ),
      'ai_runtime.background_failed',
    );
    this.created = null;
  }
  private async received(frame: HubSocketFrame): Promise<void> {
    if (frame.type === 'computer') {
      this.computer.receive(frame.frame);
      return;
    }
    if (frame.type === 'welcome') {
      // eslint-disable-next-line local/no-swallowed-errors -- the failed welcome was reported to its own caller
      this.initializing = this.initializing
        .catch((): void => undefined)
        .then(() => this.welcome(frame));
      await this.initializing;
      return;
    }
    await this.initializing;
    if (this.generation !== frame.generation) return;
    await this.answerRequest(frame.id, frame.generation, frame.request);
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
        failure('conflict', 'The request ID was already used with different runtime or input.'),
      );
      return;
    }
    if (known === undefined && !COMPUTER_RUNTIME_EXECUTE.safeParse(request).success) {
      this.reply(id, generation, await this.request(request));
      return;
    }
    const result = known?.result ?? this.request(request);
    if (known === undefined) {
      this.receipts.set(id, {
        signature,
        result: result.then((reply) =>
          JSON.stringify(reply).length <= 64_000
            ? reply
            : failure(
                'conflict',
                'This mutation already completed; its large result was not retained and was not replayed.',
              ),
        ),
      });
      trimOldest(this.receipts, KEPT_RECEIPTS);
    }
    this.reply(id, generation, await result);
  }
  private async welcome(frame: Extract<HubRuntimeControl, { type: 'welcome' }>): Promise<void> {
    this.disconnect();
    this.generation = frame.generation;
    this.computer.start();
    const created = await this.runtimeHosts();
    if (this.generation !== frame.generation) return;
    try {
      await this.register(created, frame.runtimes, frame.generation);
    } catch (cause) {
      this.disconnect();
      throw cause;
    }
    if (this.generation === frame.generation) this.options.changed(true);
  }
  private runtimeHosts(): Promise<readonly ComputerRuntimeHost[]> {
    this.created ??= this.options.createRuntimeHosts().catch((cause: unknown) => {
      this.created = null;
      throw cause;
    });
    return this.created;
  }
  private async register(
    created: readonly ComputerRuntimeHost[],
    settings: readonly ComputerRuntimeSettings[],
    generation: string,
  ): Promise<void> {
    for (const host of created) {
      const runtime = settings.find((entry) => entry.runtime === host.runtime);
      if (runtime === undefined) continue;
      this.hosts.set(host.runtime, host);
      await host.execute(
        COMPUTER_RUNTIME_EXECUTE.parse({
          runtime: runtime.runtime,
          request: { operation: 'configure', settings: runtime.settings },
        }),
      );
      if (this.generation !== generation) return;
      this.subscriptions.push(
        host.onEvent((event) => {
          if (this.generation === generation && this.hosts.get(host.runtime) === host)
            this.event(event);
        }),
      );
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
      const known = apiErrorFor(cause);
      return failure(known?.code ?? 'upstream_failed', messageOf(cause).slice(0, 2000));
    }
  }
  private reply(id: string, generation: string, result: ReplyResult): void {
    if (this.generation !== generation) return;
    this.link.send({ type: 'reply', id, generation, device_id: this.options.deviceId, result });
  }
  private event(event: ComputerRuntimeHostEvent): void {
    if (this.generation === null) return;
    const bound = { device_id: this.options.deviceId, generation: this.generation };
    if (event.kind === 'capabilities')
      this.link.send({
        ...bound,
        type: 'capabilities',
        runtime: event.runtime,
        capabilities: event.capabilities,
      });
    else if (event.kind === 'native')
      this.link.send(
        NODE_RUNTIME_FRAME.parse({
          ...bound,
          type: 'native_event',
          payload: { runtime: event.runtime, notice: event.notice },
        }),
      );
    else
      this.link.send(
        NODE_RUNTIME_FRAME.parse({
          ...bound,
          type: 'provider_event',
          payload: { runtime: event.runtime, event: event.event },
        }),
      );
  }
  private disconnect(): void {
    this.generation = null;
    this.computer.stop();
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.length = 0;
    this.hosts.clear();
    this.options.changed(false);
  }
}
function failure(code: ApiErrorCode, message: string): ReplyResult {
  return { ok: false, failure: { code, message } };
}
class NodeRuntimeError extends Error {
  override readonly name = 'NodeRuntimeError';
}
