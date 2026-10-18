import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import { userConfigHome, userStateHome } from '../user-directories';
import { API_KEY_SECRET } from './settings';

const GUI = z.object({
  tls: z.boolean(),
  address: z.string().regex(/^[\w.[\]:-]+:\d{1,5}$/, 'a host and port'),
  apiKey: z.string().min(8),
});

class SyncthingImportError extends Error {
  override readonly name = 'SyncthingImportError';
}

interface SyncthingImport {
  readonly settings: Readonly<Record<string, JsonValue>>;
  readonly secrets: Readonly<Record<string, string>>;
}

function syncthingConfigPaths(): readonly string[] {
  return [
    join(userStateHome(), 'syncthing', 'config.xml'),
    join(userConfigHome(), 'syncthing', 'config.xml'),
  ];
}

export async function importLocalSyncthing(): Promise<SyncthingImport> {
  const gui = parseGui(await firstReadable(syncthingConfigPaths()));
  const host = gui.address.replace(/^0\.0\.0\.0:/, '127.0.0.1:').replace(/^\[::\]:/, '[::1]:');
  return {
    settings: { url: `${gui.tls ? 'https' : 'http'}://${host}` },
    secrets: { [API_KEY_SECRET]: gui.apiKey },
  };
}

export function parseGui(xml: string): z.output<typeof GUI> {
  const block = /<gui\b([^>]*)>([\s\S]*?)<\/gui>/.exec(xml);
  if (block === null) {
    throw new SyncthingImportError('Syncthing’s settings have no web page section');
  }
  const [, attributes = '', body = ''] = block;
  const parsed = GUI.safeParse({
    tls: /\btls="true"/.test(attributes),
    address: /<address>([^<]*)<\/address>/.exec(body)?.[1]?.trim(),
    apiKey: /<apikey>([^<]*)<\/apikey>/.exec(body)?.[1]?.trim(),
  });
  if (!parsed.success) {
    throw new SyncthingImportError('Syncthing’s web page address or API key is missing');
  }
  return parsed.data;
}

async function firstReadable(paths: readonly string[]): Promise<string> {
  for (const path of paths) {
    // eslint-disable-next-line local/no-swallowed-errors -- an unreadable candidate path is skipped for the next one
    const text = await readFile(path, 'utf8').catch(() => null);
    if (text !== null) {
      return text;
    }
  }
  throw new SyncthingImportError('Syncthing is not set up for this computer’s user');
}
