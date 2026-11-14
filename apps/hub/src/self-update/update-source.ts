import { readFileSync } from 'node:fs';
import type { HubLayout } from '../data-layout';
import { parseServiceConfigText, type UpdateSource } from '../service/configuration';

export function findUpdateSource(layout: HubLayout): UpdateSource | undefined {
  const path = layout.system.config.service;
  return parseServiceConfigText(path, readFileSync(path, 'utf8')).updateSource;
}
