import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env, stdout } from 'node:process';
import { isMissing } from './errors.ts';
import { REPO } from './paths.ts';

const LOCKS = join(REPO, 'tmp', 'locks');
const LOCK = join(LOCKS, 'drive-rig.lock');
const OWNER_FILE = join(LOCK, 'owner');
const OWNER_VARIABLE = 'SE_RIG_LOCK_OWNER';

const UNGUARDED = new Set(['status', 'walk', 'lock', 'unlock']);

function isExists(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'EEXIST';
}

async function holder(): Promise<string | null> {
  try {
    return (await readFile(OWNER_FILE, 'utf8')).trim();
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

async function locked(): Promise<boolean> {
  try {
    await stat(LOCK);
    return true;
  } catch (cause) {
    if (isMissing(cause)) return false;
    throw cause;
  }
}

export async function requireRigLock(command: string, args: readonly string[]): Promise<void> {
  if (UNGUARDED.has(command) || (command === 'net' && args[0] === 'status')) return;
  if (!(await locked())) return;
  const owner = await holder();
  if (owner !== null && env[OWNER_VARIABLE] === owner) return;
  throw new Error(
    `The rig is locked by ${owner ?? 'an owner that has not written its id yet'} (${LOCK}). Run it only through that owner, or wait until it runs "rig unlock".`,
  );
}

export async function lock(args: readonly string[]): Promise<void> {
  const id = args[0];
  if (id === undefined || id === '') throw new Error('Usage: rig lock <owner id>');
  await mkdir(LOCKS, { recursive: true });
  try {
    await mkdir(LOCK);
  } catch (cause) {
    if (!isExists(cause)) throw cause;
    const owner = (await holder()) ?? 'an unknown owner';
    throw new Error(`The rig is already locked by ${owner}.`, { cause });
  }
  await writeFile(OWNER_FILE, `${id}\n`);
  stdout.write(`Locked as ${id}. Run commands with ${OWNER_VARIABLE}=${id}.\n`);
}

export async function unlock(args: readonly string[]): Promise<void> {
  const id = args[0];
  if (!(await locked())) throw new Error('The rig is not locked.');
  const owner = await holder();
  if (id !== owner)
    throw new Error(
      `The rig is locked by ${owner ?? 'an unknown owner'}; only that owner can release it.`,
    );
  await rm(LOCK, { recursive: true, force: true });
  stdout.write('Unlocked.\n');
}
