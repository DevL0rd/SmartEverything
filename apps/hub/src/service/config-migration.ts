import { execFile } from 'node:child_process';
import { open, readFile, rename } from 'node:fs/promises';
import { promisify } from 'node:util';
import { messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { isMissing } from '../fs-util';
import { repositoryOf } from '../self-update/push-webhook';
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

const git = promisify(execFile);

async function repositoryOfSource(
  path: string,
  source: Readonly<Record<string, unknown>>,
): Promise<string> {
  const { checkout, remote } = source;
  if (typeof checkout !== 'string' || typeof remote !== 'string')
    throw new ServiceConfigError(
      path,
      'repository: a source without it needs its checkout and remote to derive it',
    );
  const { stdout } = await git('git', ['remote', 'get-url', remote], { cwd: checkout });
  const repository = repositoryOf(stdout);
  if (repository === undefined)
    throw new ServiceConfigError(path, 'repository: the update remote is not on GitHub');
  return repository;
}

async function withRepository(
  path: string,
  config: Readonly<Record<string, unknown>>,
): Promise<Readonly<Record<string, unknown>> | null> {
  const source = CONFIG_OBJECT.safeParse(config['updateSource']);
  if (!source.success || 'repository' in source.data) return null;
  const repository = await repositoryOfSource(path, source.data);
  return { ...config, updateSource: { repository, ...source.data } };
}

export async function migrateHubServiceConfig(path: string): Promise<boolean> {
  const text = await readText(path);
  if (text === null) return false;
  const config = parsedObject(path, text);
  if (config === null) return false;
  if ('role' in config && config['role'] !== 'hub') {
    throw new ServiceConfigError(path, 'role: only a hub configuration belongs to the hub service');
  }
  const withoutRole = Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'role'));
  const sourced = await withRepository(path, withoutRole);
  if (!('role' in config) && sourced === null) return false;
  await replaceDurably(path, `${JSON.stringify(sourced ?? withoutRole, null, 2)}\n`);
  return true;
}
