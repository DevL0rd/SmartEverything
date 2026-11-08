import { open, readFile, rename } from 'node:fs/promises';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { isMissing } from '../fs-util';
import { ServiceConfigError } from './configuration';

const CONFIG_OBJECT = z.record(z.string(), z.unknown());

function parsedObject(path: string, text: string): Readonly<Record<string, unknown>> | null {
  try {
    const parsed = CONFIG_OBJECT.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch (cause) {
    throw new ServiceConfigError(path, `it is not JSON (${messageOf(cause)})`);
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function replaceDurably(path: string, text: string): Promise<void> {
  const staged = `${path}.migrating`;
  const handle = await open(staged, 'w', 0o600);
  try {
    await handle.writeFile(text);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(staged, path);
}

export async function migrateHubServiceConfig(path: string): Promise<boolean> {
  const text = await readText(path);
  if (text === null) return false;
  const config = parsedObject(path, text);
  if (config === null || !('role' in config)) return false;
  if (config['role'] !== 'hub') {
    throw new ServiceConfigError(path, 'role: only a hub configuration belongs to the hub service');
  }
  const rest = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'role'));
  await replaceDurably(path, `${JSON.stringify(rest, null, 2)}\n`);
  return true;
}
