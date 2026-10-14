const FAMILY_PREFIX = /^(Claude|Gemini)\s+(?=\S)/;

const LEADING_VERSION = /^\d+(?:\.\d+)*\s+(?=\S)/;

const LATEST_SUFFIX = /\s*\(latest\)$/i;

export const MODEL_LOADING_NAME = 'Loading model…';

export function shortModelName(name: string): string {
  return name.replace(FAMILY_PREFIX, '').replace(LEADING_VERSION, '');
}

export function plainModelName(name: string): string {
  return name.replace(LATEST_SUFFIX, '');
}

export function modelIdName(model: string | null): string {
  if (model === null) {
    return MODEL_LOADING_NAME;
  }
  return model.slice(model.lastIndexOf('/') + 1);
}
