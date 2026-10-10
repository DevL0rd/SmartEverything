import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { OPENROUTER_KEY } from '@smarteverything/domain';

const ENV_LINE = /^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)$/m;
const QUOTES = /^(["'])(.*)\1$/;

function discordinatorEnvFile(): string {
  return join(homedir(), '.local', 'share', 'discordinator', '.env');
}

function missing(cause: unknown): boolean {
  return cause instanceof Error && 'code' in cause && cause.code === 'ENOENT';
}

async function envText(): Promise<string> {
  try {
    return await readFile(discordinatorEnvFile(), 'utf8');
  } catch (cause) {
    if (missing(cause)) {
      return '';
    }
    throw cause;
  }
}

function valueOf(line: string): string {
  const trimmed = line.trim();
  return QUOTES.exec(trimmed)?.[2] ?? trimmed;
}

export async function readDiscordinatorKey(): Promise<string | null> {
  const raw = ENV_LINE.exec(await envText())?.[1];
  if (raw === undefined) {
    return null;
  }
  const parsed = OPENROUTER_KEY.safeParse(valueOf(raw));
  return parsed.success ? parsed.data : null;
}

export async function discordinatorHasKey(): Promise<boolean> {
  return (await readDiscordinatorKey()) !== null;
}
