import { NodeConnection } from './node-connection';
import type { NodeHubTransport } from '../client-network/node-transport';
import { HarnessCalls } from './harness-connection';
import { isSupplierInferenceControl, supplierInferenceControl } from './harness-model-inference';
import { NodeHarnessError, NodeHarnessBinding } from './harness-binding';
import { NativePreviewRelay } from '../preview/native-relay';
import { randomUUID } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  HUB_HARNESS_CONTROL,
  NODE_HARNESS_CONNECT,
  NODE_HARNESS_FRAME,
  NODE_HARNESS_PATH,
  NODE_HARNESS_PROTOCOL,
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_FILE_CAPABILITY,
  isPreviewControl,
} from '@smarteverything/domain';
import type {
  AiSubscriptionHostStatus,
  HubHarnessControl,
  NodeHarnessFrame,
} from '@smarteverything/domain';
import { createComputerHarness, type ComputerHarness } from '@smarteverything/harness/process';
import { harnessFailure } from './harness-failure';
import type { Logger } from '@smarteverything/logging';
import type { NodeServiceConfig } from '../service/configuration';
import { subscriptionFailureCategory } from './harness-subscription-failure';

type Welcome = Extract<HubHarnessControl, { type: 'harness_welcome' }>;
interface Composed {
  readonly harness: ComputerHarness;
  readonly preview: NativePreviewRelay;
  readonly generation: string;
}
export class NodeHarnessRuntime {
  private ready: WebSocket | null = null;
  private binding: NodeHarnessBinding | null = null;
  private runtime: Composed | null = null;
  private stopped = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly instance = randomUUID();
  private readonly unsent: string[] = [];
  private readonly calls = new HarnessCalls();
  private readonly connection: NodeConnection;
  constructor(
    private readonly options: {
      readonly node: NodeServiceConfig['node'];
      readonly dataDirectory: string;
      readonly machineId: string;
      readonly name: string;
      readonly log: Logger;
      readonly transport?: NodeHubTransport;
    },
  ) {
    this.connection = new NodeConnection({
      hubUrl: options.node.hub_url,
      path: NODE_HARNESS_PATH,
      protocol: NODE_HARNESS_PROTOCOL,
      token: options.node.node_token,
      transport: options.transport,
      log: options.log,
      failure: 'harness.connection_failed',
      opened: (socket): void => {
        this.connect(socket);
      },
      message: (socket, text): void => {
        try {
          this.receive(socket, text);
        } catch (cause) {
          this.rejected(cause);
        }
      },
      closed: (socket): void => {
        if (this.ready === socket) this.ready = null;
        this.binding = null;
        this.calls.detach(socket);
      },
    });
  }
  start(): void {
    const os = platform();
    if (os !== 'linux' && os !== 'darwin') {
      this.options.log.warn('harness.unavailable', {
        reason: 'Computer DSH supports Linux/macOS; Windows runtime is unavailable.',
      });
      return;
    }
    this.connection.start();
  }
  private connect(socket: WebSocket): void {
    this.binding = new NodeHarnessBinding(
      this.instance,
      platform() === 'darwin' ? 'macos' : 'linux',
    );
    socket.send(
      JSON.stringify(
        NODE_HARNESS_CONNECT.parse({
          type: 'harness_connect',
          protocol: 1,
          device_id: this.options.node.device_id,
          runtime_instance: this.instance,
          machine_id: this.options.machineId,
          capabilities: [
            HARNESS_CONFIGURATION_CAPABILITY,
            HARNESS_SUBSCRIPTION_CAPABILITY,
            AI_PREVIEW_CAPABILITY,
            AI_PREVIEW_FILE_CAPABILITY,
          ],
        }),
      ),
    );
  }
  private receive(socket: WebSocket, text: string): void {
    const binding = this.binding;
    if (binding === null)
      throw new NodeHarnessError('Computer control arrived before its handshake.');
    const frame = HUB_HARNESS_CONTROL.parse(JSON.parse(text));
    binding.validate(frame, this.options.node.device_id);
    if (frame.type === 'harness_call_result') {
      this.calls.receive(frame);
      return;
    }
    if (frame.type === 'harness_welcome') {
      this.connection.welcomed();
      this.calls.attach({ socket, binding: frameBinding(frame) });
      this.queue = this.queue
        .then(() => this.welcomed(socket, frame, binding.os))
        .catch((cause: unknown) => {
          this.options.log.error('harness.compose_failed', cause);
          socket.terminate();
        });
      return;
    }
    void this.queue
      .then(() => this.control(socket, frame))
      .catch((cause: unknown) => {
        this.rejected(cause);
      });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.ready = null;
    this.connection.stop();
    this.calls.close();
    await this.queue;
    await this.dispose();
  }
  private async welcomed(socket: WebSocket, frame: Welcome, os: 'linux' | 'macos'): Promise<void> {
    if (this.stopped || this.connection.socket !== socket) return;
    const runtime =
      this.runtime?.generation === frame.generation ? this.runtime : await this.replace(frame, os);
    if (this.connection.socket !== socket || socket.readyState !== socket.OPEN) return;
    this.ready = socket;
    this.connection.healthy();
    socket.send(JSON.stringify(runtime.harness.hello));
    for (const text of this.unsent.splice(0)) socket.send(text);
    this.options.log.info('harness.ready', {
      device_id: frame.device_id,
      generation: frame.generation,
      runtime_instance: frame.runtime_instance,
    });
    runtime.harness.reconnectSubscriptions().catch((cause: unknown) => {
      this.options.log.error('harness.compose_failed', cause);
      socket.terminate();
    });
  }
  private async replace(frame: Welcome, os: 'linux' | 'macos'): Promise<Composed> {
    await this.dispose();
    const preview = new NativePreviewRelay(
      this.options.node.hub_url,
      this.options.node.node_token,
      this.options.log,
      this.options.transport,
    );
    const harness = await createComputerHarness(
      {
        type: 'harness_boot',
        protocol: 1,
        device_id: frame.device_id,
        generation: frame.generation,
        runtime_instance: frame.runtime_instance,
        name: this.options.name,
        hub_url: this.options.node.hub_url,
        token: this.options.node.node_token,
        home_directory: homedir(),
        state_directory: join(this.options.dataDirectory, 'harness'),
        platform: os,
        permission: DEFAULT_AI_HARNESS_PERMISSION,
        ...(frame.configuration === undefined ? {} : { configuration: frame.configuration }),
      },
      this.calls,
      {
        publishSubscription: (status): Promise<void> => this.publishSubscription(frame, status),
        preview,
        ...(this.options.transport?.fetch === undefined
          ? {}
          : { fetch: this.options.transport.fetch }),
      },
    );
    this.runtime = { harness, preview, generation: frame.generation };
    return this.runtime;
  }
  private async dispose(): Promise<void> {
    const runtime = this.runtime;
    this.runtime = null;
    this.unsent.length = 0;
    if (runtime === null) return;
    runtime.preview.stop();
    try {
      await runtime.harness.stop();
    } catch (cause) {
      this.options.log.error('harness.cleanup_unknown', cause);
    }
  }
  private publishSubscription(binding: Welcome, status: AiSubscriptionHostStatus): Promise<void> {
    const socket = this.connection.socket;
    if (socket === null || socket.readyState !== socket.OPEN)
      return Promise.reject(new NodeHarnessError('Subscription supplying host disconnected.'));
    socket.send(
      JSON.stringify(
        NODE_HARNESS_FRAME.parse({
          ...frameBinding(binding),
          type: 'harness_subscription_status',
          status,
        }),
      ),
    );
    return Promise.resolve();
  }
  private deliver(frame: NodeHarnessFrame): void {
    const text = JSON.stringify(frame);
    const socket = this.ready;
    if (socket !== null && socket.readyState === socket.OPEN) socket.send(text);
    else this.unsent.push(text);
  }
  private async control(
    socket: WebSocket,
    frame: Exclude<HubHarnessControl, { type: 'harness_welcome' | 'harness_call_result' }>,
  ): Promise<void> {
    const runtime = this.runtime;
    if (runtime === null || this.ready !== socket)
      throw new NodeHarnessError('Computer composition has not completed its hello.');
    const { harness, preview } = runtime;
    if (isSupplierInferenceControl(frame)) {
      await supplierInferenceControl(socket, harness, frame, (): boolean => this.ready === socket);
      return;
    }
    if (isPreviewControl(frame)) {
      await this.previewControl(preview, frame);
      return;
    }
    if (frame.type === 'harness_subscription_control') {
      await this.subscriptionControl(harness, frame);
      return;
    }
    if (frame.type === 'harness_configuration') {
      await harness.configure(frame.configuration);
      return;
    }
    if (frame.type === 'harness_ownership_lost') {
      preview.lose(frame.session_id);
      await harness.lose(frame.session_id);
      return;
    }
    await this.request(harness, frame);
  }
  private async previewControl(
    preview: NativePreviewRelay,
    frame: Extract<HubHarnessControl, { type: 'preview_open' | 'preview_file_close' }>,
  ): Promise<void> {
    if (frame.type === 'preview_file_close') {
      preview.forget(frame.watch_handle);
      return;
    }
    try {
      await preview.open(frame);
    } catch (cause) {
      this.options.log.warn('preview.open_refused', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
  }
  private async subscriptionControl(
    harness: ComputerHarness,
    frame: Extract<HubHarnessControl, { type: 'harness_subscription_control' }>,
  ): Promise<void> {
    let reply: NodeHarnessFrame;
    let stage: 'control' | 'reply' = 'control';
    const binding = {
      device_id: frame.device_id,
      generation: frame.generation,
      runtime_instance: frame.runtime_instance,
      id: frame.id,
    };
    try {
      const status = await harness.subscription(frame.request);
      stage = 'reply';
      reply = NODE_HARNESS_FRAME.parse({
        ...binding,
        type: 'harness_subscription_status',
        status,
      });
    } catch (cause) {
      if (!(cause instanceof Error)) throw cause;
      this.options.log.warn('subscription.control_failed', {
        provider: frame.request.provider,
        operation: frame.request.command.kind,
        category: subscriptionFailureCategory(cause),
        stage,
      });
      reply = NODE_HARNESS_FRAME.parse({
        ...binding,
        type: 'harness_subscription_failure',
        failure: {
          code: 'operation_failed',
          message:
            'Subscription control was refused or failed. Refresh the supplying account status and check the current sign-in attempt.',
          retry_at: null,
        },
      });
    }
    this.deliver(reply);
  }
  private async request(
    harness: ComputerHarness,
    frame: Extract<HubHarnessControl, { type: 'harness_request' }>,
  ): Promise<void> {
    let result: Extract<NodeHarnessFrame, { type: 'harness_reply' }>['result'];
    try {
      result = {
        ok: true,
        receipt: await harness.execute(frame.id, frame.request, frame.model_route),
      };
    } catch (cause) {
      this.options.log.error('harness.operation_failed', cause, { operation_id: frame.id });
      result = {
        ok: false,
        failure: harnessFailure(cause),
      };
    }
    this.deliver(
      NODE_HARNESS_FRAME.parse({
        type: 'harness_reply',
        id: frame.id,
        device_id: frame.device_id,
        generation: frame.generation,
        runtime_instance: frame.runtime_instance,
        result,
      }),
    );
  }
  private rejected(cause: unknown): void {
    this.options.log.error('harness.frame_rejected', cause);
  }
}
function frameBinding(frame: Welcome): {
  readonly device_id: string;
  readonly generation: string;
  readonly runtime_instance: string;
} {
  return {
    device_id: frame.device_id,
    generation: frame.generation,
    runtime_instance: frame.runtime_instance,
  };
}
