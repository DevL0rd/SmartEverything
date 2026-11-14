import { readFileSync } from 'node:fs';
import { isMissing } from '../fs-util';
import type { HubLayout } from '../data-layout';
import { parseServiceConfigText, type UpdateSource } from '../service/configuration';

function configText(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return undefined;
    throw cause;
  }
}

export function findUpdateSource(layout: HubLayout): UpdateSource | undefined {
  const path = layout.system.config.service;
  const text = configText(path);
  return text === undefined ? undefined : parseServiceConfigText(path, text).updateSource;
}
