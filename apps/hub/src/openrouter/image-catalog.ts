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
  readonly imageEndpoints: () => ImageEndpointSnapshot;
  readonly saveImageEndpoints: (snapshot: ImageEndpointSnapshot) => void;
}
export class OpenRouterImageCatalog {
  private snapshot: ImageEndpointSnapshot;
  private refreshing: Promise<readonly ImageEndpoint[]> | null = null;
  private readonly stopping = new AbortController();
  constructor(
    private readonly deps: {
      readonly client: OpenRouterClient;
      readonly store: ImageEndpointStore;
      readonly now: () => Date;
    },
  ) {
    this.snapshot = deps.store.imageEndpoints();
  }
  async list(refresh: boolean): Promise<readonly ImageEndpoint[]> {
    if (refresh || this.snapshot.endpoints.length === 0) return this.refresh();
    if (this.stale())
      void this.refresh().catch((cause: unknown) => {
        log.warn('image.catalog_refresh_failed', {
          reason: messageOf(cause),
        });
      });
    return this.snapshot.endpoints;
  }
  async endpointFor(
    request: Pick<ImageOperationRequest, 'model' | 'provider_tag'>,
  ): Promise<ImageEndpoint> {
    const found = this.find(request) ?? (await this.refresh().then(() => this.find(request)));
    if (found === undefined)
      throw new ApiError('invalid_request', 'Select a currently available image endpoint.');
    return found;
  }
  stop(): Promise<unknown> {
    this.stopping.abort();
    return Promise.allSettled([this.refreshing]);
  }
  private find(
    request: Pick<ImageOperationRequest, 'model' | 'provider_tag'>,
  ): ImageEndpoint | undefined {
    return this.snapshot.endpoints.find(
      (row) => row.model === request.model && row.provider_tag === request.provider_tag,
    );
  }
  private stale(): boolean {
    const refreshed = this.snapshot.refreshed_at;
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
      this.snapshot = {
        refreshed_at: this.deps.now().toISOString(),
        endpoints: groups.flat(),
      };
      this.deps.store.saveImageEndpoints(this.snapshot);
      return this.snapshot.endpoints;
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
