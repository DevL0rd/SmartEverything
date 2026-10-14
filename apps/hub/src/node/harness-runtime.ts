import {
  openNodeHubSocket,
  retireNodeHubSocket,
  type NodeHubTransport,
} from '../client-network/node-transport';
import { harnessSocketUrl, publishHarnessSubscription } from './harness-connection';
import { isSupplierInferenceControl, supplierInferenceControl } from './harness-model-inference';
import { NodeHarnessError, NodeHarnessBinding } from './harness-binding';
import { NativePreviewRelay } from '../preview/native-relay';
import { randomUUID } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import {
  DEFAULT_AI_HARNESS_PERMISSION,
  HUB_HARNESS_CONTROL,
  NODE_HARNESS_CONNECT,
  NODE_HARNESS_FRAME,
  NODE_HARNESS_PROTOCOL,
  HARNESS_CONFIGURATION_CAPABILITY,
  HARNESS_SUBSCRIPTION_CAPABILITY,
  AI_PREVIEW_CAPABILITY,
  AI_PREVIEW_FILE_CAPABILITY,
  isPreviewControl,
  SUBSCRIPTION_INFERENCE_MAX_BYTES,
} from '@smarteverything/domain';
import type { HubHarnessControl, NodeHarnessFrame } from '@smarteverything/domain';
import { createComputerHarness, type ComputerHarness } from '@smarteverything/harness/process';
import type { Logger } from '@smarteverything/logging';
import type { NodeServiceConfig } from '../service/configuration';
import { nodeHarnessFetch } from '../client-network/harness-fetch';
import { subscriptionFailureCategory } from './harness-subscription-failure';

const WELCOME_TIMEOUT_MS = 30_000;
export class NodeHarnessRuntime {
  private socket: WebSocket | null = null;
  private unsubscribeRoute: (() => void) | null = null;
  private harness: ComputerHarness | null = null;
  private preview: NativePreviewRelay | null = null;
  private retry: NodeJS.Timeout | null = null;
  private stopped = false;
  private delay = 1000;
  private retiring = false;
  private cleanup: Promise<void> = Promise.resolve();
  private composing: Promise<void> = Promise.resolve();
  constructor(
    private readonly options: {
      readonly node: NodeServiceConfig['node'];
      readonly dataDirectory: string;
      readonly machineId: string;
      readonly name: string;
      readonly log: Logger;
      readonly transport?: NodeHubTransport;
    },
  ) {}
  private followRoute(): void {
    if (this.unsubscribeRoute !== null || this.options.transport === undefined) return;
    this.unsubscribeRoute = this.options.transport.subscribe(() => {
      if (this.retry !== null) clearTimeout(this.retry);
      this.retry = null;
      const socket = this.socket;
      if (socket !== null) {
        this.closed(socket);
        retireNodeHubSocket(socket);
      } else this.start();
    });
  }
  start(): void {
    if (this.stopped || this.socket !== null || this.retiring) return;
    this.followRoute();
    if (this.options.transport?.ready() === false) return;
    const os = platform();
    if (os !== 'linux' && os !== 'darwin') {
      this.options.log.warn('harness.unavailable', {
        reason: 'Computer DSH supports Linux/macOS; Windows runtime is unavailable.',
      });
      return;
    }
    const url = harnessSocketUrl(this.options.node.hub_url, this.options.log);
    if (url === null) return;
    const socket = openNodeHubSocket(this.options.transport, url, NODE_HARNESS_PROTOCOL, {
      headers: { authorization: `Bearer ${this.options.node.node_token}` },
      maxPayload: SUBSCRIPTION_INFERENCE_MAX_BYTES,
      handshakeTimeout: 10_000,
    });
    this.socket = socket;
    const instance = randomUUID();
    const timer = setTimeout(() => {
      socket.terminate();
    }, WELCOME_TIMEOUT_MS);
    this.watchSocket(socket, instance, timer, os === 'darwin' ? 'macos' : 'linux');
  }
  private watchSocket(
    socket: WebSocket,
    instance: string,
    timer: NodeJS.Timeout,
    os: 'macos' | 'linux',
  ): void {
    socket.on('open', () => {
      this.connect(socket, instance);
    });
    const binding = new NodeHarnessBinding(instance, timer, os);
    socket.on('message', (raw, binary) => {
      try {
        if (binary) throw new NodeHarnessError('Computer controls require JSON text.');
        const bytes = Buffer.isBuffer(raw)
          ? raw
          : Array.isArray(raw)
            ? Buffer.concat(raw)
            : Buffer.from(raw);
        this.receive(socket, bytes.toString('utf8'), binding);
      } catch (cause) {
        this.failed(socket, cause);
      }
    });
    socket.on('error', (cause) => {
      this.options.log.error('harness.connection_failed', cause);
    });
    socket.on('close', () => {
      clearTimeout(timer);
      this.closed(socket);
    });
  }
  private connect(socket: WebSocket, instance: string): void {
    socket.send(
      JSON.stringify(
        NODE_HARNESS_CONNECT.parse({
          type: 'harness_connect',
          protocol: 1,
          device_id: this.options.node.device_id,
          runtime_instance: instance,
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
  private receive(socket: WebSocket, text: string, binding: NodeHarnessBinding): void {
    if (this.socket !== socket) return;
    const frame = HUB_HARNESS_CONTROL.parse(JSON.parse(text));
    binding.validate(frame, this.options.node.device_id);
    if (frame.type === 'harness_welcome') {
      this.composing = this.compose(socket, frame, binding.os).catch((cause: unknown) => {
        this.failed(socket, cause);
      });
      return;
    }
    void this.control(socket, frame).catch((cause: unknown) => {
      this.failed(socket, cause);
    });
  }
  async stop(): Promise<void> {
    this.stopped = true;
    this.unsubscribeRoute?.();
    this.unsubscribeRoute = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    const socket = this.socket;
    if (socket !== null) {
      retireNodeHubSocket(socket);
      this.closed(socket);
    }
    await this.cleanup;
  }
  private async compose(
    socket: WebSocket,
    frame: Extract<HubHarnessControl, { type: 'harness_welcome' }>,
    os: 'linux' | 'macos',
  ): Promise<void> {
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
        inbound_execution: true,
        permission: DEFAULT_AI_HARNESS_PERMISSION,
        ...(frame.configuration === undefined ? {} : { configuration: frame.configuration }),
      },
      (status): Promise<void> => publishHarnessSubscription(socket, this.socket, frame, status),
      preview,
      nodeHarnessFetch(this.options.node, this.options.transport?.fetch),
    );
    if (this.socket !== socket || this.stopped || socket.readyState !== WebSocket.OPEN) {
      preview.stop();
      await harness.stop();
      return;
    }
    this.harness = harness;
    this.preview = preview;
    this.delay = 1000;
    socket.send(JSON.stringify(harness.hello));
    await harness.reconnectSubscriptions();
    this.options.log.info('harness.ready', {
      device_id: frame.device_id,
      generation: frame.generation,
      runtime_instance: frame.runtime_instance,
    });
  }
  private async control(
    socket: WebSocket,
    frame: Exclude<HubHarnessControl, { type: 'harness_welcome' }>,
  ): Promise<void> {
    const harness = this.harness;
    if (harness === null || this.socket !== socket)
      throw new NodeHarnessError('Computer composition has not completed its hello.');
    if (isSupplierInferenceControl(frame)) {
      await supplierInferenceControl(socket, harness, frame, (): boolean => this.socket === socket);
      return;
    }
    if (isPreviewControl(frame)) {
      await this.previewControl(frame);
      return;
    }
    if (frame.type === 'harness_subscription_control') {
      await this.subscriptionControl(socket, harness, frame);
      return;
    }
    if (frame.type === 'harness_configuration') {
      await harness.configure(frame.configuration);
      return;
    }
    if (frame.type === 'harness_ownership_lost') {
      this.preview?.lose(frame.session_id);
      await harness.lose(frame.session_id);
      return;
    }
    await this.request(socket, harness, frame);
  }
  private async previewControl(
    frame: Extract<HubHarnessControl, { type: 'preview_open' | 'preview_file_close' }>,
  ): Promise<void> {
    if (frame.type === 'preview_file_close') this.preview?.forget(frame.watch_handle);
    else await this.openPreview(frame);
  }
  private async openPreview(
    frame: Extract<HubHarnessControl, { type: 'preview_open' }>,
  ): Promise<void> {
    if (this.preview === null)
      throw new NodeHarnessError('The native preview adapter is unavailable.');
    try {
      await this.preview.open(frame);
    } catch (cause) {
      this.options.log.warn('preview.open_refused', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
  }
  private async subscriptionControl(
    socket: WebSocket,
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
    if (this.socket === socket && socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(reply));
  }
  private async request(
    socket: WebSocket,
    harness: ComputerHarness,
    frame: Extract<HubHarnessControl, { type: 'harness_request' }>,
  ): Promise<void> {
    let result: Extract<
      ReturnType<typeof NODE_HARNESS_FRAME.parse>,
      { type: 'harness_reply' }
    >['result'];
    try {
      result = {
        ok: true,
        receipt: await harness.execute(frame.id, frame.request, frame.model_route),
      };
    } catch (cause) {
      this.options.log.error('harness.operation_failed', cause, { operation_id: frame.id });
      result = {
        ok: false,
        failure: {
          code: 'operation_failed',
          message:
            cause instanceof Error
              ? cause.message.slice(0, 2000)
              : 'Computer native operation failed.',
          retry_at: null,
        },
      };
    }
    if (this.socket === socket && socket.readyState === WebSocket.OPEN)
      socket.send(
        JSON.stringify(
          NODE_HARNESS_FRAME.parse({
            type: 'harness_reply',
            id: frame.id,
            device_id: frame.device_id,
            generation: frame.generation,
            runtime_instance: frame.runtime_instance,
            result,
          }),
        ),
      );
  }
  private failed(socket: WebSocket, cause: unknown): void {
    this.options.log.error('harness.protocol_failed', cause);
    socket.terminate();
    this.closed(socket);
  }
  private closed(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    this.retiring = true;
    const harness = this.harness;
    this.harness = null;
    this.preview?.stop();
    this.preview = null;
    this.cleanup = (async (): Promise<void> => {
      if (harness !== null) {
        try {
          await harness.stop();
        } catch (cause) {
          this.options.log.error('harness.cleanup_unknown', cause);
        }
      }
      await this.composing;
    })();
    void this.cleanup.then(() => {
      this.retiring = false;
      if (this.stopped) return;
      this.retry = setTimeout(() => {
        this.retry = null;
        this.start();
      }, this.delay);
      this.delay = Math.min(this.delay * 2, 30_000);
    });
  }
}
