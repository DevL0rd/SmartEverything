import { createHash } from 'node:crypto';
import {
  ApiError,
  IMAGE_ENDPOINT,
  type ImageEndpoint,
  type ImageOperationRequest,
} from '@smarteverything/domain';
import { IMAGE_MODELS_WIRE, IMAGE_ENDPOINTS_WIRE, type ImageEndpointWire } from './image-wire';
import { boundedText, parseImageJson } from './image-response';

const ORIGIN = 'https://openrouter.ai/api/v1';
const METADATA_BYTES_MAX = 4 * 1024 * 1024;
export type ImageFetch = typeof fetch;
export class OpenRouterImageCatalog {
  private rows: readonly ImageEndpoint[] = [];
  constructor(private readonly request: ImageFetch) {}
  list(): readonly ImageEndpoint[] {
    return this.rows;
  }
  async refresh(signal: AbortSignal): Promise<readonly ImageEndpoint[]> {
    const models = IMAGE_MODELS_WIRE.parse(await this.read('/images/models', signal));
    const rows: ImageEndpoint[] = [];
    for (const model of models.data) {
      const path = modelEndpointPath(model.id);
      const metadata = IMAGE_ENDPOINTS_WIRE.parse(await this.read(path, signal));
      if (metadata.id !== model.id)
        throw new ApiError('invalid_request', 'Image endpoint metadata identity mismatch.');
      for (const endpoint of metadata.endpoints) {
        if (endpoint.provider_tag === null || endpoint.provider_tag === '') continue;
        const revision = endpointRevision(endpoint);
        rows.push(
          IMAGE_ENDPOINT.parse({
            model: model.id,
            name: model.name,
            provider_tag: endpoint.provider_tag,
            revision,
            parameters: endpoint.supported_parameters,
            supports_streaming: endpoint.supports_streaming,
            pricing: endpoint.pricing,
          }),
        );
      }
    }
    this.rows = rows;
    return rows;
  }
  selected(request: ImageOperationRequest, references: number): ImageEndpoint {
    const endpoint = this.rows.find(
      (row) =>
        row.model === request.model &&
        row.provider_tag === request.provider_tag &&
        row.revision === request.capability_revision,
    );
    if (endpoint === undefined)
      throw new ApiError('invalid_request', 'Select a currently available image endpoint.');
    const eligible = this.rows.filter(
      (row) => row.model === request.model && row.provider_tag === request.provider_tag,
    );
    if (eligible.some((row) => row.revision !== endpoint.revision))
      throw new ApiError(
        'invalid_request',
        'This provider tag selects multiple distinct endpoints and cannot be pinned exactly.',
      );
    admitOptions(endpoint, request, references);
    return endpoint;
  }
  async verify(endpoint: ImageEndpoint, signal: AbortSignal): Promise<void> {
    const path = modelEndpointPath(endpoint.model);
    const metadata = IMAGE_ENDPOINTS_WIRE.parse(await this.read(path, signal));
    const eligible = metadata.endpoints.filter((row) => row.provider_tag === endpoint.provider_tag);
    const selected = eligible.find(
      (row) =>
        row.provider_tag === endpoint.provider_tag && endpointRevision(row) === endpoint.revision,
    );
    if (
      metadata.id !== endpoint.model ||
      selected === undefined ||
      eligible.some((row) => endpointRevision(row) !== endpoint.revision)
    )
      throw new ApiError(
        'invalid_request',
        'The selected image endpoint changed. Refresh and select it again.',
      );
  }
  private async read(path: string, signal: AbortSignal): Promise<unknown> {
    const response = await this.request(`${ORIGIN}${path}`, { signal, redirect: 'error' });
    if (!response.ok)
      throw new ApiError('invalid_request', `Image metadata HTTP ${String(response.status)}.`);
    return parseImageJson(await boundedText(response, METADATA_BYTES_MAX, signal));
  }
}
function admitParameter(endpoint: ImageEndpoint, key: string, value: string | number): void {
  const descriptor = endpoint.parameters[key];
  if (descriptor === undefined) {
    if (isOmittedDefault(key, value)) return;
    throw new ApiError('invalid_request', `This image endpoint does not support ${key}.`);
  }
  if (descriptor.type === 'boolean') return;
  const valid =
    descriptor.type === 'enum'
      ? descriptor.values.includes(value)
      : typeof value === 'number' && value >= descriptor.min && value <= descriptor.max;
  if (!valid)
    throw new ApiError('invalid_request', `This image endpoint rejects the selected ${key}.`);
}
function admitOptions(
  endpoint: ImageEndpoint,
  request: ImageOperationRequest,
  references: number,
): void {
  admitOutput(endpoint, request);
  admitParameter(endpoint, 'input_references', references);
  for (const [key, value] of Object.entries(request.options)) {
    if (key === 'stream') {
      if (value === true && !endpoint.supports_streaming)
        throw new ApiError('invalid_request', 'This image endpoint does not stream previews.');
    } else if (typeof value === 'string' || typeof value === 'number')
      admitParameter(endpoint, key, value);
  }
}

function isOmittedDefault(key: string, value: string | number): boolean {
  return (key === 'n' && value === 1) || (key === 'input_references' && value === 0);
}

function admitOutput(endpoint: ImageEndpoint, request: ImageOperationRequest): void {
  const formats = endpoint.parameters['output_format'];
  if (formats?.type === 'enum') admitRasterFormats(formats.values, request.options.output_format);
  if (request.options.background === 'transparent' && request.options.output_format === 'jpeg')
    throw new ApiError('invalid_request', 'Transparent images require PNG or WebP output.');
}
function admitRasterFormats(
  values: readonly (string | number)[],
  selected: string | undefined,
): void {
  if (!values.some((value) => value === 'png' || value === 'jpeg' || value === 'webp'))
    throw new ApiError(
      'unsupported_media_type',
      'This image endpoint produces no supported raster output.',
    );
  if (values.includes('svg') && selected === undefined)
    throw new ApiError(
      'invalid_request',
      'Select a supported raster output format for this endpoint.',
    );
}

function modelEndpointPath(model: string): string {
  return `/images/models/${model.split('/').map(encodeURIComponent).join('/')}/endpoints`;
}
function endpointRevision(endpoint: ImageEndpointWire): string {
  return createHash('sha256').update(JSON.stringify(endpoint)).digest('hex');
}
