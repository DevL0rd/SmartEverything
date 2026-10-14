import type { SubscriptionInferencePort } from '@smarteverything/harness';
import { ApiError, AI_HARNESS_HOST, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiHarnessHost,
  HubPreviewOpen,
  HubPreviewFileClose,
  AiSubscriptionHostStatus,
  HarnessSubscriptionRequest,
  AiHarnessTarget,
  HarnessRuntimeRequest,
  HarnessRuntimeReceipt,
  NodeHarnessFrame,
  HubHarnessControl,
  HarnessDesiredConfiguration,
  AiHarnessManifest,
} from '@smarteverything/domain';

export interface HarnessConnection {
  readonly inference?: SubscriptionInferencePort;
  readonly preview?: (frame: HubPreviewOpen) => void;
  readonly previewFileClose?: (frame: HubPreviewFileClose) => void;
  readonly host: AiHarnessHost;
  readonly actor: { readonly kind: 'node' | 'server'; readonly id: string };
  readonly profileId?: string;
  readonly subscription?: (
    request: HarnessSubscriptionRequest,
  ) => Promise<AiSubscriptionHostStatus>;
  readonly configure?: (configuration: HarnessDesiredConfiguration) => void;
  readonly hasSession?: (id: string, epoch: number) => boolean;
  readonly execute?: (id: string, request: HarnessRuntimeRequest) => Promise<HarnessRuntimeReceipt>;
}
export type HarnessOwnershipLoss = Extract<HubHarnessControl, { type: 'harness_ownership_lost' }>;
export class HarnessDirectory {
  private readonly hosts = new Map<string, HarnessConnection>();
  private readonly registrationListeners = new Set<(connection: HarnessConnection) => void>();
  private readonly listeners = new Set<(frame: NodeHarnessFrame) => void>();
  private readonly ownershipListeners = new Set<(loss: HarnessOwnershipLoss) => void>();
  private readonly offlineListeners = new Set<(host: AiHarnessHost) => void>();
  constructor(private readonly admit?: (request: HarnessRuntimeRequest) => void) {}
  register(connection: HarnessConnection): void {
    const host = AI_HARNESS_HOST.parse(connection.host);
    const registered = { ...connection, host };
    this.hosts.set(harnessTargetKey(host.target), registered);
    for (const listener of this.registrationListeners) listener(registered);
  }
  onRegister(listener: (connection: HarnessConnection) => void): () => void {
    this.registrationListeners.add(listener);
    return (): void => {
      this.registrationListeners.delete(listener);
    };
  }
  updateManifest(host: AiHarnessHost, manifest: AiHarnessManifest): void {
    const connection = this.registered(host.target);
    if (
      connection.host.connection_generation !== host.connection_generation ||
      connection.host.runtime_instance !== host.runtime_instance ||
      !connection.host.online
    )
      throw new ApiError('conflict', 'The reported host generation is no longer online.');
    this.hosts.set(harnessTargetKey(host.target), {
      ...connection,
      host: AI_HARNESS_HOST.parse({
        ...connection.host,
        manifest: {
          ...manifest,
          ...(connection.host.manifest?.subscription_consumer?.protocol === 1
            ? { subscription_consumer: { protocol: 1 } }
            : {}),
          ...(connection.inference === undefined
            ? {}
            : { subscription_inference: { protocol: 1 } }),
        },
      }),
    });
  }
  get(target: AiHarnessTarget): HarnessConnection {
    const connection = this.registered(target);
    if (!connection.host.online)
      throw new ApiError('conflict', 'The selected SmartEverything execution host is unavailable.');
    return connection;
  }
  registered(target: AiHarnessTarget): HarnessConnection {
    const connection = this.hosts.get(harnessTargetKey(target));
    if (connection === undefined)
      throw new ApiError('conflict', 'The selected SmartEverything execution host is absent.');
    return connection;
  }
  bound(deviceId: string, generation: string, instance: string): HarnessConnection {
    const connection = this.get({ kind: 'device', device_id: deviceId });
    if (
      connection.host.connection_generation !== generation ||
      connection.host.runtime_instance !== instance
    )
      throw new ApiError('conflict', 'This harness runtime generation has been replaced.');
    return connection;
  }
  list(): AiHarnessHost[] {
    return [...this.hosts.values()].map((entry) => entry.host);
  }
  visible(role: 'owner' | 'member', _clientId: string): AiHarnessHost[] {
    return [...this.hosts.values()]
      .filter((entry) => entry.host.target.kind === 'server' || role === 'owner')
      .map((entry) => entry.host);
  }
  offline(target: AiHarnessTarget, generation?: string, instance?: string): void {
    const key = harnessTargetKey(target);
    const connection = this.hosts.get(key);
    if (
      connection !== undefined &&
      connection.host.online &&
      (generation === undefined || connection.host.connection_generation === generation) &&
      (instance === undefined || connection.host.runtime_instance === instance)
    ) {
      this.hosts.set(key, {
        ...connection,
        host: {
          ...connection.host,
          online: false,
          unavailable_reason: 'Execution host disconnected; outstanding effects may be unknown.',
        },
      });
      for (const listener of this.offlineListeners) listener(connection.host);
    }
  }
  onOffline(listener: (host: AiHarnessHost) => void): () => void {
    this.offlineListeners.add(listener);
    return (): void => {
      this.offlineListeners.delete(listener);
    };
  }
  onOwnershipLost(listener: (loss: HarnessOwnershipLoss) => void): () => void {
    this.ownershipListeners.add(listener);
    return (): void => {
      this.ownershipListeners.delete(listener);
    };
  }
  ownershipLost(loss: HarnessOwnershipLoss): void {
    this.bound(loss.device_id, loss.generation, loss.runtime_instance);
    for (const listener of this.ownershipListeners) listener(loss);
  }
  async execute(
    target: AiHarnessTarget,
    id: string,
    request: HarnessRuntimeRequest,
  ): Promise<HarnessRuntimeReceipt> {
    this.admit?.(request);
    const connection = this.get(target);
    if (!connection.host.inbound_execution || connection.execute === undefined)
      throw new ApiError(
        'forbidden',
        'This host accepts only requests started locally in its app.',
      );
    return connection.execute(id, request);
  }
  onFrame(listener: (frame: NodeHarnessFrame) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  frame(frame: NodeHarnessFrame): void {
    this.bound(frame.device_id, frame.generation, frame.runtime_instance);
    for (const listener of this.listeners) listener(frame);
  }
}
