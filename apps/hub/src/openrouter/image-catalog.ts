import {
  ApiError,
  IMAGE_ENDPOINT,
  type ImageEndpoint,
  type ImageOperationRequest,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import pLimit from 'p-limit';
import type { OpenRouterClient } from './client';
import { OpenRouterError } from './errors';
import type { ImageEndpointSnapshot } from './image-wire';
import type { OrImageModel } from './wire';

const log = new Logger('hub.assistant');
const REFRESH_TIMEOUT_MS = 30_000;
const ENDPOINT_FETCHES = 6;
const STALE_MS = 86_400_000;
interface ImageEndpointStore {
  readonly load: () => Promise<void>;
  readonly imageEndpoints: () => ImageEndpointSnapshot;
  readonly saveImageEndpoints: (snapshot: ImageEndpointSnapshot) => Promise<void>;
}
export class OpenRouterImageCatalog {
  private snapshot: ImageEndpointSnapshot | null = null;
  private refreshing: Promise<readonly ImageEndpoint[]> | null = null;
  private readonly stopping = new AbortController();
  constructor(
    private readonly deps: {
      readonly client: OpenRouterClient;
      readonly store: ImageEndpointStore;
      readonly now: () => Date;
    },
  ) {}
  async list(refresh: boolean): Promise<readonly ImageEndpoint[]> {
    const snapshot = await this.current();
    if (refresh || snapshot.endpoints.length === 0) return this.refresh();
    if (this.stale(snapshot))
      void this.refresh().catch((cause: unknown) => {
        log.warn('image.catalog_refresh_failed', {
          reason: messageOf(cause),
        });
      });
    return snapshot.endpoints;
  }
  async endpointFor(
    request: Pick<ImageOperationRequest, 'model' | 'provider_tag'>,
  ): Promise<ImageEndpoint> {
    const found =
      this.find(await this.current(), request) ?? this.find(await this.refreshed(), request);
    if (found === undefined)
      throw new ApiError('invalid_request', 'Select a currently available image endpoint.');
    return found;
  }
  stop(): Promise<unknown> {
    this.stopping.abort();
    return Promise.allSettled([this.refreshing]);
  }
  private async current(): Promise<ImageEndpointSnapshot> {
    if (this.snapshot === null) {
      await this.deps.store.load();
      this.snapshot ??= this.deps.store.imageEndpoints();
    }
    return this.snapshot;
  }
  private async refreshed(): Promise<ImageEndpointSnapshot> {
    await this.refresh();
    return await this.current();
  }
  private find(
    snapshot: ImageEndpointSnapshot,
    request: Pick<ImageOperationRequest, 'model' | 'provider_tag'>,
  ): ImageEndpoint | undefined {
    const ofModel = snapshot.endpoints.filter((row) => row.model === request.model);
    if (request.provider_tag !== undefined) {
      return ofModel.find((row) => row.provider_tag === request.provider_tag);
    }
    if (ofModel.length > 1) {
      throw new ApiError(
        'invalid_request',
        `${request.model} has several endpoints; give providerTag, one of: ${ofModel.map((row) => row.provider_tag).join(', ')}`,
      );
    }
    return ofModel[0];
  }
  private stale(snapshot: ImageEndpointSnapshot): boolean {
    const refreshed = snapshot.refreshed_at;
    return refreshed === null || this.deps.now().getTime() - Date.parse(refreshed) > STALE_MS;
  }
  private refresh(): Promise<readonly ImageEndpoint[]> {
    this.refreshing ??= this.load().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  private async load(): Promise<readonly ImageEndpoint[]> {
    const signal = AbortSignal.any([this.stopping.signal, AbortSignal.timeout(REFRESH_TIMEOUT_MS)]);
    try {
      const models = await this.deps.client.imageModels(signal);
      const limit = pLimit(ENDPOINT_FETCHES);
      const groups = await Promise.all(
        models.map((model) => limit(() => this.endpointsOf(model, signal))),
      );
      const snapshot = {
        refreshed_at: this.deps.now().toISOString(),
        endpoints: groups.flat(),
      };
      this.snapshot = snapshot;
      await this.deps.store.saveImageEndpoints(snapshot);
      return snapshot.endpoints;
    } catch (cause) {
      if (cause instanceof OpenRouterError) throw new ApiError('upstream_failed', cause.message);
      throw cause;
    }
  }
  private async endpointsOf(model: OrImageModel, signal: AbortSignal): Promise<ImageEndpoint[]> {
    try {
      const wire = await this.deps.client.imageEndpoints(model, signal);
      return wire.flatMap((endpoint) =>
        endpoint.provider_tag === null || endpoint.provider_tag === ''
          ? []
          : [
              IMAGE_ENDPOINT.parse({
                model: model.id,
                name: model.name,
                provider_tag: endpoint.provider_tag,
                parameters: endpoint.supported_parameters,
                supports_streaming: endpoint.supports_streaming,
                pricing: endpoint.pricing,
              }),
            ],
      );
    } catch (cause) {
      if (!(cause instanceof OpenRouterError) || cause.code !== 'unreadable') throw cause;
      log.warn('image.endpoints_unreadable', { model: model.id, reason: cause.message });
      return [];
    }
  }
}
