import { existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { rawFailure, type Section } from './output.ts';
import { nonEmptyLines, ROOT, type Run } from './process.ts';

const TYPE_EXT = new Set(['.ts', '.tsx', '.cts', '.mts']);
const ROOT_CONFIGS = new Set(['pnpm-workspace.yaml', 'pnpm-lock.yaml']);
const TSCONFIG = /^tsconfig.*\.json$/;
const LINE =
  /^(?:(?<file>.+?)\((?<row>\d+),(?<column>\d+)\): )?error (?<code>TS\d+): (?<message>.*)$/;

export type Snapshot =
  | { readonly failed: string }
  | {
      readonly counts: Readonly<Record<string, number>>;
      readonly projects?: readonly string[] | undefined;
    };

export interface TscError {
  readonly file: string | null;
  readonly key: string;
  readonly text: string;
}

export interface Claim {
  readonly files: readonly string[];
  readonly snapshot: Snapshot | null;
}

function isConfig(rel: string): boolean {
  const name = basename(rel);
  return (
    name === 'package.json' ||
    TSCONFIG.test(name) ||
    ROOT_CONFIGS.has(rel) ||
    rel.startsWith('patches/')
  );
}

export function isSource(rel: string): boolean {
  return TYPE_EXT.has(extname(rel));
}

export function affectsTypes(rel: string): boolean {
  return isSource(rel) || isConfig(rel);
}

export function owningProject(rel: string): string | null {
  let dir = dirname(rel);
  while (dir !== '.') {
    if (existsSync(join(ROOT, dir, 'tsconfig.json'))) return dir;
    dir = dirname(dir);
  }
  return null;
}

function parseLine(line: string): TscError | null {
  const groups = LINE.exec(line)?.groups;
  const { file, row, column, code, message } = groups ?? {};
  if (code === undefined || message === undefined) return null;
  if (file === undefined) return { file: null, key: line, text: line };
  return {
    file,
    key: `${file}\t${code}\t${message}`,
    text: `${file} ${row ?? '0'}:${column ?? '0'} ${code} ${message}`,
  };
}

export function parseTsc(output: string): TscError[] {
  return nonEmptyLines(output).flatMap((line) => parseLine(line) ?? []);
}

export function countErrors(output: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const error of parseTsc(output)) counts[error.key] = (counts[error.key] ?? 0) + 1;
  return counts;
}

function grown(errors: readonly TscError[], snapshot: Snapshot | null): ReadonlySet<TscError> {
  if (snapshot === null || 'failed' in snapshot) return new Set();
  const seen = new Map<string, number>();
  return new Set(
    errors.filter((error) => {
      const index = (seen.get(error.key) ?? 0) + 1;
      seen.set(error.key, index);
      return index > (snapshot.counts[error.key] ?? 0);
    }),
  );
}

function missingSnapshot(snapshot: Snapshot | null): string[] {
  if (snapshot === null) return ['no snapshot was taken before your first edit'];
  return 'failed' in snapshot ? [snapshot.failed] : [];
}

export function judge(check: string, result: Run, claim: Claim): Section[] {
  if (result.code === 0) return [];
  const errors = parseTsc(result.stdout);
  if (errors.length === 0) {
    return [rawFailure(`${check} (failed without file-level errors)`, result)];
  }
  const fresh = grown(errors, claim.snapshot);
  const reported = errors.filter(
    (error) => fresh.has(error) || (error.file !== null && claim.files.includes(error.file)),
  );
  if (reported.length === 0) return [];
  const notes = missingSnapshot(claim.snapshot).map(
    (reason) => `${reason}, so only errors in edited files count`,
  );
  const lines = [...notes, ...reported.map((error) => error.text)];
  return [{ check: `${check} (edited files and new errors)`, lines }];
}
