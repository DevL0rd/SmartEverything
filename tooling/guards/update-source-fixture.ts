import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { dataLayoutOf } from '../release-hub-files.ts';

export function writeUpdateSource(
  data: string,
  source: { readonly checkout: string; readonly remote?: string; readonly branch?: string },
): void {
  const file = dataLayoutOf(data).system.config.service;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({
      go2rtcBinary: '/opt/go2rtc',
      updateSource: { remote: 'origin', branch: 'main', ...source },
    }),
  );
}
