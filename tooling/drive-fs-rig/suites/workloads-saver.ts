import { randomBytes } from 'node:crypto';
import {
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import { argv } from 'node:process';
import { basename, dirname, join } from 'node:path';
import { isMissing } from '../errors.ts';

const TEMP_SUFFIX_BYTES = 3;
const DEFAULT_MODE = 0o644;

function modeOf(target: string): number {
  const descriptor = openSync(target, 'r');
  try {
    return fstatSync(descriptor).mode & 0o7777;
  } finally {
    closeSync(descriptor);
  }
}

function existingMode(target: string): number {
  try {
    return modeOf(target);
  } catch (cause) {
    if (isMissing(cause)) return DEFAULT_MODE;
    throw cause;
  }
}

function writeAll(descriptor: number, content: Buffer): void {
  let written = 0;
  while (written < content.length) written += writeSync(descriptor, content, written);
}

function syncDirectory(directory: string): void {
  const descriptor = openSync(directory, 'r');
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeTemporary(path: string, content: Buffer, mode: number): void {
  const descriptor = openSync(path, 'wx', 0o600);
  try {
    writeAll(descriptor, content);
    fchmodSync(descriptor, mode);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function suffix(): string {
  return randomBytes(TEMP_SUFFIX_BYTES).toString('hex');
}

export function saveLikeQt(target: string, content: Buffer): void {
  const temporary = `${target}.${suffix()}`;
  writeTemporary(temporary, content, existingMode(target));
  renameSync(temporary, target);
}

export function lockFileName(target: string): string {
  return join(dirname(target), `.~lock.${basename(target)}#`);
}

export function saveLikeLibreOffice(target: string, content: Buffer): void {
  const lock = lockFileName(target);
  const descriptor = openSync(lock, 'wx', 0o644);
  try {
    writeAll(descriptor, Buffer.from(`,rig,computer,${new Date().toISOString()},;`));
  } finally {
    closeSync(descriptor);
  }
  try {
    const temporary = join(dirname(target), `lu${suffix()}.tmp`);
    writeTemporary(temporary, content, existingMode(target));
    renameSync(temporary, target);
    syncDirectory(dirname(target));
  } finally {
    rmSync(lock, { force: true });
  }
}

const SAVERS = new Map<string, (target: string, content: Buffer) => void>([
  ['qt', saveLikeQt],
  ['libreoffice', saveLikeLibreOffice],
]);

if (argv[1] === import.meta.filename) {
  const [kind, target, source] = argv.slice(2);
  const save = kind === undefined ? undefined : SAVERS.get(kind);
  if (save === undefined || target === undefined || source === undefined)
    throw new Error('Use: workloads-saver.ts <qt|libreoffice> <target file> <content file>');
  save(target, readFileSync(source));
}
