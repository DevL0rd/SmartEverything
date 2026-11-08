import { lstat, readFile, rm, rmdir } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { atomicWrite } from '../pointer';

export const JOURNAL_FILE = 'system/migration/layout-1.json';

const STATUS = z.enum(['pending', 'started', 'done']);

const RENAME_STEP = z.strictObject({
  kind: z.literal('rename'),
  from: z.string().min(1),
  to: z.string().min(1),
  created: z.array(z.string()).readonly(),
  status: STATUS,
});

const RMDIR_STEP = z.strictObject({
  kind: z.literal('rmdir'),
  path: z.string().min(1),
  removed: z.boolean(),
  status: STATUS,
});

const STEP = z.discriminatedUnion('kind', [RENAME_STEP, RMDIR_STEP]);

const JOURNAL = z.strictObject({
  version: z.literal(1),
  createdDirs: z.array(z.string()).readonly(),
  complete: z.boolean(),
  unclassified: z.array(z.string()).readonly(),
  steps: z.array(STEP).readonly(),
});

export type JournalStep = Readonly<z.infer<typeof STEP>>;
export type RenameStep = Readonly<z.infer<typeof RENAME_STEP>>;
export type RmdirStep = Readonly<z.infer<typeof RMDIR_STEP>>;
export type Journal = Readonly<z.infer<typeof JOURNAL>>;

export type NewStep =
  | { readonly kind: 'rename'; readonly from: string; readonly to: string }
  | { readonly kind: 'rmdir'; readonly path: string };

export class LayoutMigrationError extends Error {
  override readonly name = 'LayoutMigrationError';
}

export function absoluteIn(root: string, relative: string): string {
  return join(root, ...relative.split('/'));
}

export function journalFile(root: string): string {
  return absoluteIn(root, JOURNAL_FILE);
}

export async function statOrUndefined(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function missingDirectories(
  root: string,
  relativeDirectory: string,
): Promise<readonly string[]> {
  const parts = relativeDirectory.split('/').filter((part) => part !== '');
  const missing: string[] = [];
  for (let length = 1; length <= parts.length; length += 1) {
    const relative = parts.slice(0, length).join('/');
    if ((await statOrUndefined(absoluteIn(root, relative))) === undefined) {
      missing.push(relative);
    }
  }
  return missing;
}

export async function readJournal(root: string): Promise<Journal | undefined> {
  const file = journalFile(root);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
  const parsed = JOURNAL.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new LayoutMigrationError(
      `the layout journal ${file} is invalid: ${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

export async function writeJournal(root: string, journal: Journal): Promise<void> {
  await atomicWrite(journalFile(root), `${JSON.stringify(JOURNAL.parse(journal), null, 2)}\n`);
}

export async function createJournal(
  root: string,
  steps: readonly NewStep[],
  unclassified: readonly string[],
): Promise<Journal> {
  const createdDirs = await missingDirectories(root, dirname(JOURNAL_FILE));
  const journal: Journal = {
    version: 1,
    createdDirs,
    complete: false,
    unclassified,
    steps: steps.map((step): JournalStep =>
      step.kind === 'rename'
        ? { kind: 'rename', from: step.from, to: step.to, created: [], status: 'pending' }
        : { kind: 'rmdir', path: step.path, removed: false, status: 'pending' },
    ),
  };
  await writeJournal(root, journal);
  return journal;
}

export interface StepAt {
  readonly root: string;
  readonly journal: Journal;
  readonly index: number;
}

export async function replaceStep(at: StepAt, step: JournalStep): Promise<Journal> {
  const next: Journal = {
    ...at.journal,
    steps: at.journal.steps.map((existing, position) => (position === at.index ? step : existing)),
  };
  await writeJournal(at.root, next);
  return next;
}

export async function markComplete(root: string, journal: Journal): Promise<Journal> {
  const next: Journal = { ...journal, complete: true };
  await writeJournal(root, next);
  return next;
}

export async function removeEmptyDirectory(path: string): Promise<boolean> {
  try {
    await rmdir(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTEMPTY')
    ) {
      return false;
    }
    throw error;
  }
}

export async function removeJournal(root: string): Promise<void> {
  await rm(journalFile(root), { force: true });
}
