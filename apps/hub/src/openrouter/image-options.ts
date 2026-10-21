import { ApiError, type ImageEndpoint, type ImageOperationRequest } from '@smarteverything/domain';

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
export function admitOptions(
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

const QUALITY_RANK: Readonly<Record<string, number>> = {
  ultra: 5,
  hd: 4,
  high: 3,
  standard: 2,
  medium: 2,
  low: 1,
  auto: 0,
};

function enumValues(endpoint: ImageEndpoint, key: string): readonly (string | number)[] {
  const descriptor = endpoint.parameters[key];
  return descriptor?.type === 'enum' ? descriptor.values : [];
}

function best<T extends string | number>(
  values: readonly T[],
  rank: (value: T) => number | null,
): T | undefined {
  let chosen: T | undefined;
  let top = -Infinity;
  for (const value of values) {
    const score = rank(value);
    if (score !== null && score > top) {
      top = score;
      chosen = value;
    }
  }
  return chosen;
}

function tierRank(value: string | number): number | null {
  const match = /^(\d+(?:\.\d+)?)(k?)$/iu.exec(String(value).trim());
  if (match === null) return null;
  return Number(match[1]) * (match[2] === '' ? 1 : 1000);
}

function ratioOfSize(size: string | undefined): number | null {
  const match = size === undefined ? null : /^(\d+)x(\d+)$/u.exec(size);
  const width = Number(match?.[1]);
  const height = Number(match?.[2]);
  return match !== null && width > 0 && height > 0 ? width / height : null;
}

function nearestRatio(values: readonly (string | number)[], ratio: number): string | undefined {
  return best(values.map(String), (value) => {
    const [width, height] = value.split(':').map(Number);
    return width !== undefined && height !== undefined && width > 0 && height > 0
      ? -Math.abs(Math.log(width / height / ratio))
      : null;
  });
}

type Options = ImageOperationRequest['options'];

function topResolution(endpoint: ImageEndpoint, options: Options): Options {
  const resolution = best(enumValues(endpoint, 'resolution'), tierRank);
  if (resolution === undefined) return options;
  const { size, ...rest } = options;
  const ratio = options.aspect_ratio === undefined ? ratioOfSize(size) : null;
  const nearest =
    ratio === null ? undefined : nearestRatio(enumValues(endpoint, 'aspect_ratio'), ratio);
  return {
    ...rest,
    ...(nearest === undefined ? {} : { aspect_ratio: nearest }),
    resolution: String(resolution),
  };
}

function transparentFormat(endpoint: ImageEndpoint, options: Options): Options {
  if (options.background !== 'transparent' || options.output_format !== undefined) return options;
  const formats = enumValues(endpoint, 'output_format');
  if (formats.includes('png')) return { ...options, output_format: 'png' };
  return formats.includes('webp') ? { ...options, output_format: 'webp' } : options;
}

export function withBestSettings(
  endpoint: ImageEndpoint,
  request: ImageOperationRequest,
): ImageOperationRequest {
  const quality = best(
    enumValues(endpoint, 'quality').map(String),
    (value) => QUALITY_RANK[value] ?? null,
  );
  const asked = quality === undefined ? request.options : { ...request.options, quality };
  return {
    ...request,
    provider_tag: endpoint.provider_tag,
    options: transparentFormat(endpoint, topResolution(endpoint, asked)),
  };
}
