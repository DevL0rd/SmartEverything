import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { HarnessRuntimeError } from '../host/errors';

const PATCHED_GENERATION = 'dsh-0.2.1-alpha.2+smarteverything-historical-paths-v1';

export async function effectiveDshGeneration(): Promise<string> {
  const [session, directory] = await Promise.all([
    readFile(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-session')), 'utf8'),
    readFile(fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-working-directory')), 'utf8'),
  ]);
  if (
    !session.includes('posix.isAbsolute(record.cwd)') ||
    !session.includes('win32.isAbsolute(record.cwd)') ||
    !directory.includes('posix.isAbsolute(value) || win32.isAbsolute(value)')
  )
    throw new HarnessRuntimeError(
      'composition_incompatible',
      'The installed DSH generation lacks the required immutable-history portability patches.',
    );
  return `${PATCHED_GENERATION}:${createHash('sha256').update(session).update(directory).digest('hex')}`;
}
