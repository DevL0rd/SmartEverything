import { mkdir, rename as nodeRename } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  absoluteIn,
  LayoutMigrationError,
  readJournal,
  removeEmptyDirectory,
  removeJournal,
  replaceStep,
  type StepAt,
  statOrUndefined,
  type Journal,
  type RenameStep,
  type RmdirStep,
} from './journal';
import { moveEntry, type MoveEntry } from './renames';

export interface ReverseOptions {
  readonly rename?: MoveEntry;
}

async function reverseRename(at: StepAt, step: RenameStep, rename: MoveEntry): Promise<Journal> {
  const { root } = at;
  const from = absoluteIn(root, step.from);
  const to = absoluteIn(root, step.to);
  const original = await statOrUndefined(from);
  const moved = await statOrUndefined(to);
  if (original !== undefined && moved !== undefined) {
    throw new LayoutMigrationError(`cannot reverse ${step.to}: ${step.from} exists again`);
  }
  if (original === undefined) {
    if (moved === undefined) {
      throw new LayoutMigrationError(`cannot reverse ${step.to}: it is missing`);
    }
    await mkdir(dirname(from), { recursive: true });
    await moveEntry(rename, to, from, [step.to, step.from]);
  }
  for (const directory of [...step.created].reverse()) {
    await removeEmptyDirectory(absoluteIn(root, directory));
  }
  return replaceStep(at, { ...step, status: 'pending' });
}

async function reverseRmdir(at: StepAt, step: RmdirStep): Promise<Journal> {
  if (step.status !== 'pending') {
    await mkdir(absoluteIn(at.root, step.path), { recursive: true });
  }
  return replaceStep(at, { ...step, status: 'pending' });
}

export async function reverseV1(root: string, options: ReverseOptions = {}): Promise<void> {
  let journal = await readJournal(root);
  if (journal === undefined) {
    throw new LayoutMigrationError(`there is no layout v1 journal under ${root} to reverse`);
  }
  const rename = options.rename ?? nodeRename;
  for (let index = journal.steps.length - 1; index >= 0; index -= 1) {
    const step = journal.steps[index];
    if (step?.kind === 'rename') {
      journal = await reverseRename({ root, journal, index }, step, rename);
    } else if (step?.kind === 'rmdir') {
      journal = await reverseRmdir({ root, journal, index }, step);
    }
  }
  await removeJournal(root);
  for (const directory of [...journal.createdDirs].reverse()) {
    await removeEmptyDirectory(absoluteIn(root, directory));
  }
}
