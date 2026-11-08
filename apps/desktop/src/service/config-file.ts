import { z } from 'zod';
import { COMPUTER_SERVICE_CONFIG, type ComputerServiceConfig } from '@smarteverything/domain';

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

export function parseComputerConfig(
  file: string,
  text: string | null,
): ComputerServiceConfig | null {
  if (text === null) return null;
  return COMPUTER_SERVICE_CONFIG.parse(existingObject(file, text));
}
