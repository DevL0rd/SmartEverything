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
