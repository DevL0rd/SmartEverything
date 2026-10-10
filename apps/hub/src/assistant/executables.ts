import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { assistantEnvironment } from './environment';
import { errorCode, isMissing } from './errors';

export interface Program {
  readonly command: string;
  readonly args: readonly string[];
}

export class ProgramMissingError extends Error {
  override readonly name = 'ProgramMissingError';

  constructor(readonly label: string) {
    super(`${label} is not installed on this computer or not on its PATH.`);
  }
}

const SHIM = /"%dp0%\\([^"]+\.[cm]?js)"\s+%\*/i;

function extensions(): readonly string[] {
  return process.platform === 'win32' ? ['.exe', '.cmd'] : [''];
}

export function searchDirectories(): string[] {
  const home = homedir();
  const known = [join(home, '.local', 'bin'), join(home, '.npm-global', 'bin'), '/usr/local/bin'];
  const path = (assistantEnvironment().PATH ?? '').split(delimiter).filter((entry) => entry !== '');
  return [...new Set([...path, ...known])];
}

async function runnable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch (cause) {
    if (!isMissing(cause) && errorCode(cause) !== 'EACCES') {
      throw cause;
    }
    return false;
  }
}

async function forcesCodexHome(path: string): Promise<boolean> {
  const info = await stat(path);
  if (!info.isFile() || info.size > 65_536) {
    return false;
  }
  return /^\s*(export\s+)?CODEX_HOME=/m.test(await readFile(path, 'utf8'));
}

async function findExecutable(
  name: string,
  label: string,
  skip: (path: string) => Promise<boolean>,
): Promise<string> {
  for (const directory of searchDirectories()) {
    for (const extension of extensions()) {
      const candidate = join(directory, `${name}${extension}`);
      if ((await runnable(candidate)) && !(await skip(candidate))) {
        return candidate;
      }
    }
  }
  throw new ProgramMissingError(label);
}

async function shimTarget(path: string): Promise<string> {
  const match = SHIM.exec(await readFile(path, 'utf8'));
  const target = match?.[1];
  if (target === undefined) {
    throw new ProgramMissingError(`A runnable program behind ${path}`);
  }
  return join(dirname(path), ...target.split('\\'));
}

async function programAt(path: string): Promise<Program> {
  if (!/\.cmd$/i.test(path)) {
    return { command: path, args: [] };
  }
  return { command: process.execPath, args: [await shimTarget(path)] };
}

export async function claudeProgram(): Promise<Program> {
  return programAt(await findExecutable('claude', 'Claude Code', () => Promise.resolve(false)));
}

export async function codexProgram(): Promise<Program> {
  return programAt(await findExecutable('codex', 'Codex', forcesCodexHome));
}

export async function claudeExecutable(): Promise<string> {
  const found = await claudeProgram();
  return found.args[0] ?? found.command;
}
