import { z } from 'zod';
import {
  parseServiceConfigText,
  type ServiceConfig,
  type HubServiceConfig,
} from '@smarteverything/hub/service/configuration';

const CONFIG_OBJECT = z.record(z.string(), z.unknown());

export class ServiceConfigFileError extends Error {
  readonly file: string;

  constructor(file: string, received: string) {
    super(`the service settings ${file} must hold a JSON object; received ${received}`);
    this.name = 'ServiceConfigFileError';
    this.file = file;
  }
}

function existingObject(file: string, text: string | null): Record<string, unknown> {
  if (text === null) {
    return {};
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    throw new ServiceConfigFileError(file, `text that is not JSON (${String(error)})`);
  }
  const parsed = CONFIG_OBJECT.safeParse(json);
  if (!parsed.success) {
    throw new ServiceConfigFileError(file, JSON.stringify(json));
  }
  return parsed.data;
}

export interface PreparedConfig {
  readonly text: string;
  readonly config: ServiceConfig;
  readonly changed: boolean;
}

export function prepareServiceConfig(
  file: string,
  existing: null,
  go2rtcBinary: string,
): PreparedConfig & { readonly config: HubServiceConfig };
export function prepareServiceConfig(
  file: string,
  existing: string | null,
  go2rtcBinary: string,
): PreparedConfig;
export function prepareServiceConfig(
  file: string,
  existing: string | null,
  go2rtcBinary: string,
): PreparedConfig {
  const previous = existingObject(file, existing);
  const merged = previous['role'] === 'node' ? previous : { ...previous, go2rtcBinary };
  const text = `${JSON.stringify(merged, null, 2)}\n`;
  return { text, config: parseServiceConfigText(file, text), changed: text !== existing };
}
