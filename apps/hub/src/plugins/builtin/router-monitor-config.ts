import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JsonValue } from '@smarteverything/domain';
import { userConfigHome } from './user-directories';

export class RouterMonitorImportError extends Error {
  override readonly name = 'RouterMonitorImportError';
}

export interface RouterMonitorImport {
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly secrets: Readonly<Record<string, string>>;
}

function routerMonitorConfigPath(): string {
  return join(userConfigHome(), 'Linux-Router-Monitor', 'config.json');
}

export async function readRouterMonitorConfig(): Promise<unknown> {
  const text = await readFile(routerMonitorConfigPath(), 'utf8').catch(() => {
    throw new RouterMonitorImportError('Router Monitor is not set up on this computer');
  });
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new RouterMonitorImportError(
      `Router Monitor settings are not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
