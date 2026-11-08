import {
  effectiveImageOptions,
  type ImageDefaultOptions,
  type ImageDefaults,
  type ImageEndpoint,
  type ImageOperationRequest,
} from '@smarteverything/domain';

type Options = ImageOperationRequest['options'];

function enumValues(endpoint: ImageEndpoint, key: string): readonly (string | number)[] {
  const descriptor = endpoint.parameters[key];
  return descriptor?.type === 'enum' ? descriptor.values : [];
}

function transparentFormat(
  endpoint: ImageEndpoint,
  options: ImageDefaultOptions,
): ImageDefaultOptions {
  if (options.background !== 'transparent' || options.output_format !== undefined) return options;
  const formats = enumValues(endpoint, 'output_format');
  if (formats.includes('png')) return { ...options, output_format: 'png' };
  return formats.includes('webp') ? { ...options, output_format: 'webp' } : options;
}

function explicitOptions({ n, stream: _stream, ...rest }: Options): ImageDefaultOptions {
  return n === 1 ? rest : { ...rest, n };
}

export function withDefaults(
  endpoint: ImageEndpoint,
  request: ImageOperationRequest,
  saved: Readonly<ImageDefaults>,
): ImageOperationRequest {
  const effective = transparentFormat(
    endpoint,
    effectiveImageOptions(endpoint, saved, explicitOptions(request.options)),
  );
  return {
    ...request,
    provider_tag: endpoint.provider_tag,
    options: {
      ...effective,
      n: effective.n ?? request.options.n,
      stream: request.options.stream,
    },
  };
}
