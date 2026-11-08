import { effectiveImageOptions, imageKey } from '@smarteverything/domain';
import type {
  ImageDefaultOptions,
  ImageDefaults,
  ImageEndpoint,
  ImageModelChoice,
} from '@smarteverything/domain';
import { updateAssistantSettings } from '../../../../api/assistant';
import { notify } from '../../../../components/toast-store';
import { useEntityStore } from '../../../../store/store-context';
import { useAssistantStatus } from '../../data/assistant-data';

const RASTER_FORMATS: readonly string[] = ['png', 'jpeg', 'webp'];

export const IMAGE_OPTION_FIELDS = [
  { key: 'aspect_ratio', label: 'Aspect ratio' },
  { key: 'resolution', label: 'Resolution' },
  { key: 'quality', label: 'Quality' },
  { key: 'background', label: 'Background' },
  { key: 'output_format', label: 'Output format' },
] as const;

export type ImageOptionKey = (typeof IMAGE_OPTION_FIELDS)[number]['key'];

export interface ImageOptionField {
  readonly key: ImageOptionKey;
  readonly label: string;
  readonly supported: boolean;
  readonly values: readonly string[];
  readonly value: string | null;
}

function rasterFormats(endpoint: ImageEndpoint): readonly string[] {
  const descriptor = endpoint.parameters['output_format'];
  if (descriptor?.type !== 'enum') return [];
  return descriptor.values.map(String).filter((value) => RASTER_FORMATS.includes(value));
}

function isRasterFormat(value: string): value is 'png' | 'jpeg' | 'webp' {
  return RASTER_FORMATS.includes(value);
}

export function optionValues(endpoint: ImageEndpoint, key: ImageOptionKey): readonly string[] {
  if (key === 'output_format') return rasterFormats(endpoint);
  const descriptor = endpoint.parameters[key];
  return descriptor?.type === 'enum' ? descriptor.values.map(String) : [];
}

export function optionSupported(endpoint: ImageEndpoint, key: ImageOptionKey): boolean {
  const descriptor = endpoint.parameters[key];
  if (descriptor?.type !== 'enum') return false;
  return key === 'output_format' ? rasterFormats(endpoint).length >= 2 : true;
}

export function imageOptionFields(
  endpoint: ImageEndpoint | null,
  defaults: ImageDefaults,
): readonly ImageOptionField[] {
  const effective = endpoint === null ? null : effectiveImageOptions(endpoint, defaults);
  return IMAGE_OPTION_FIELDS.map(({ key, label }) => {
    const supported = endpoint !== null && optionSupported(endpoint, key);
    const current = supported ? effective?.[key] : undefined;
    return {
      key,
      label,
      supported,
      values: endpoint !== null && supported ? optionValues(endpoint, key) : [],
      value: current ?? null,
    };
  });
}

export function useImageDefaults(): ImageDefaults {
  return useAssistantStatus()?.settings.image_defaults ?? {};
}

function withoutOption(entry: ImageDefaultOptions, key: ImageOptionKey): ImageDefaultOptions {
  const next = { ...entry };
  switch (key) {
    case 'aspect_ratio':
      delete next.aspect_ratio;
      break;
    case 'resolution':
      delete next.resolution;
      break;
    case 'quality':
      delete next.quality;
      break;
    case 'background':
      delete next.background;
      break;
    case 'output_format':
      delete next.output_format;
      break;
  }
  return next;
}

function withoutKey(defaults: ImageDefaults, key: string): ImageDefaults {
  const next: Record<string, ImageDefaultOptions> = {};
  for (const [name, value] of Object.entries(defaults)) {
    if (name !== key) {
      next[name] = value;
    }
  }
  return next;
}

export function withImageDefault(
  defaults: ImageDefaults,
  choice: ImageModelChoice,
  key: ImageOptionKey,
  value: string | null,
): ImageDefaults {
  const mapKey = imageKey(choice);
  const current = { ...defaults[mapKey] };
  const entry =
    value === null
      ? withoutOption(current, key)
      : key === 'output_format'
        ? isRasterFormat(value)
          ? { ...current, output_format: value }
          : current
        : { ...current, [key]: value };
  if (Object.keys(entry).length === 0) return withoutKey(defaults, mapKey);
  return { ...defaults, [mapKey]: entry };
}

export function useImageDefaultsChange(): (
  choice: ImageModelChoice,
  key: ImageOptionKey,
  value: string | null,
) => void {
  const store = useEntityStore();
  return (choice, key, value): void => {
    const defaults = store.get().assistant?.settings.image_defaults ?? {};
    updateAssistantSettings({ image_defaults: withImageDefault(defaults, choice, key, value) })
      .then((status) => {
        store.update((state) => ({ ...state, assistant: status }));
      })
      .catch((error: unknown) => {
        notify({ message: 'The image defaults were not changed', error, tone: 'critical' });
      });
  };
}
