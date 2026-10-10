import { existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { z } from 'zod';
import type { Graph } from './graph.ts';
import { Attribution, changedExports, type Originals } from './symbols.ts';
import { HookError } from './input.ts';
import { rawFailure, type Section } from './output.ts';
import { nonEmptyLines, ROOT, type Run } from './process.ts';

const TYPE_EXT = new Set(['.ts', '.tsx', '.cts', '.mts']);
const ROOT_CONFIGS = new Set(['pnpm-workspace.yaml', 'pnpm-lock.yaml']);
const LOCATED =
  /^(?<file>.+?)\((?<row>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.*)$/;
const UNLOCATED = /^error (?<code>TS\d+): (?<message>.*)$/;
const TSCONFIG = /^tsconfig.*\.json$/;
const tscLine = z.object({
  file: z.string(),
  row: z.string(),
  column: z.string(),
  code: z.string(),
  message: z.string(),
});
const tscSetupLine = z.object({ code: z.string(), message: z.string() });

export type Snapshot =
  { readonly failed: string } | { readonly counts: Readonly<Record<string, number>> };

interface TscError {
  readonly file: string | null;
  readonly code: string;
  readonly key: string;
  readonly text: string;
}

export interface Peer {
  readonly files: readonly string[];
  readonly originals: Originals;
  readonly snapshot: Snapshot | null;
}

interface Claim {
  readonly files: readonly string[];
  readonly snapshot: Snapshot | null;
  readonly originals: Originals;
  readonly peers: readonly Peer[];
  readonly label: string;
}

interface Pause {
  readonly section: Section;
  readonly by: readonly string[];
}

export interface Judgement {
  readonly sections: readonly Section[];
  readonly paused: Pause | null;
  readonly unexplained: readonly string[];
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

export function affectsTypes(rel: string): boolean {
  return TYPE_EXT.has(extname(rel)) || isConfig(rel);
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
  const located = LOCATED.exec(line)?.groups;
  if (located !== undefined) {
    const parsed = tscLine.safeParse(located);
    if (!parsed.success) throw new HookError('TscOutputError', `tsc line not understood: ${line}`);
    const { file, row, column, code, message } = parsed.data;
    return {
      file,
      code,
      key: `${file}\t${code}\t${message}`,
      text: `${file} ${row}:${column} ${code} ${message}`,
    };
  }
  const unlocated = UNLOCATED.exec(line)?.groups;
  if (unlocated === undefined) return null;
  const parsed = tscSetupLine.safeParse(unlocated);
  if (!parsed.success) throw new HookError('TscOutputError', `tsc line not understood: ${line}`);
  return { file: null, code: parsed.data.code, key: line, text: line };
}

function parseTsc(output: string): TscError[] {
  return nonEmptyLines(output).flatMap((line) => parseLine(line) ?? []);
}

export function countErrors(output: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const error of parseTsc(output)) counts[error.key] = (counts[error.key] ?? 0) + 1;
  return counts;
}

function increases(
  errors: readonly TscError[],
  snapshot: { readonly counts: Readonly<Record<string, number>> },
): TscError[] {
  const seen = new Map<string, number>();
  return errors.filter((error) => {
    const index = (seen.get(error.key) ?? 0) + 1;
    seen.set(error.key, index);
    return index > (snapshot.counts[error.key] ?? 0);
  });
}

function freshFor(errors: readonly TscError[], snapshot: Snapshot | null): TscError[] {
  if (snapshot === null || 'failed' in snapshot) return [...errors];
  return increases(errors, snapshot);
}

function ownedByPeers(
  errors: readonly TscError[],
  candidates: readonly TscError[],
  peers: readonly Peer[],
  coverage: (peer: Peer) => (file: string) => boolean,
): ReadonlySet<TscError> {
  const owned = new Set<TscError>();
  if (candidates.length === 0) return owned;
  const files = new Set(candidates.map((error) => error.file));
  for (const peer of peers) {
    const covers = coverage(peer);
    const covered = errors.filter(
      (error) => error.file !== null && files.has(error.file) && covers(error.file),
    );
    for (const error of freshFor(covered, peer.snapshot)) owned.add(error);
  }
  return owned;
}

function claimScope(graph: Graph, files: readonly string[]): ReadonlySet<string> {
  return new Set(
    files.flatMap((rel) => [
      ...graph.scopeOf(isConfig(rel) ? owningProject(rel) : graph.projectOf(rel)),
    ]),
  );
}

function stoppers(graph: Graph, errors: readonly TscError[]): TscError[] {
  const parsedOnly = graph.withSyntaxErrors([
    ...new Set(errors.flatMap((error) => (error.code.startsWith('TS1') ? (error.file ?? []) : []))),
  ]);
  return errors.filter(
    (error) =>
      error.file === null ||
      error.code.startsWith('TS5') ||
      TSCONFIG.test(basename(error.file)) ||
      parsedOnly.has(error.file),
  );
}

function pause(
  check: string,
  graph: Graph,
  errors: readonly TscError[],
  claim: Claim,
): Pause | null {
  const foreign = stoppers(graph, errors).filter(
    (error) => error.file === null || !claim.files.includes(error.file),
  );
  const blocked = new Set(
    foreign.flatMap((error) => {
      const project = error.file === null ? null : graph.projectOf(error.file);
      return project === null ? graph.projects : [project];
    }),
  );
  const hit = [...claimScope(graph, claim.files)].filter((project) => blocked.has(project));
  if (hit.length === 0) return null;
  const by = [...new Set(foreign.map((error) => error.file ?? 'the project setup'))];
  const note = `types are not checked in ${hit.join(', ')} until these errors are fixed: ${by.join(', ')}`;
  return {
    section: { check: `${check} (paused)`, lines: [note, ...foreign.map((error) => error.text)] },
    by,
  };
}

function explainer(
  graph: Graph,
  files: readonly string[],
  originals: Originals,
): (file: string) => boolean {
  const sources = files.filter((rel) => !isConfig(rel) && TYPE_EXT.has(extname(rel)));
  const changes = new Map(
    sources.map((rel) => [rel, changedExports(graph.typescript, rel, originals[rel])]),
  );
  const attribution = new Attribution(graph, changes);
  const configs = files.filter(isConfig);
  return (file) => {
    if (files.includes(file)) return true;
    const project = graph.projectOf(file);
    if (project !== null && configs.some((rel) => graph.scopeOf(owningProject(rel)).has(project))) {
      return true;
    }
    return changes.size > 0 && attribution.usesChanged(file);
  };
}

function editedBy(peer: Peer): (file: string) => boolean {
  return (file) => peer.files.includes(file);
}

function attribute(
  errors: readonly TscError[],
  graph: Graph,
  claim: Claim,
  snapshot: { readonly counts: Readonly<Record<string, number>> },
): { readonly own: readonly string[]; readonly unexplained: readonly string[] } {
  const grown = increases(errors, snapshot).filter((error) => error.file !== null);
  const explains = explainer(graph, claim.files, claim.originals);
  const inPeerFiles = ownedByPeers(errors, grown, claim.peers, editedBy);
  const own = grown.filter(
    (error) =>
      error.file !== null &&
      (claim.files.includes(error.file) || !inPeerFiles.has(error)) &&
      explains(error.file),
  );
  const rest = grown.filter((error) => !own.includes(error));
  const peerExplained = ownedByPeers(errors, rest, claim.peers, (peer) =>
    explainer(graph, peer.files, peer.originals),
  );
  const unexplained = rest
    .filter((error) => !peerExplained.has(error))
    .flatMap((error) => error.file ?? []);
  return { own: own.map((error) => error.text), unexplained: [...new Set(unexplained)] };
}

export function judge(check: string, result: Run, graph: Graph, claim: Claim): Judgement {
  const none = { sections: [], paused: null, unexplained: [] };
  if (result.code === 0 || claim.files.length === 0) return none;
  const errors = parseTsc(result.stdout);
  if (errors.length === 0) {
    return {
      ...none,
      sections: [rawFailure(`${check} (failed without file-level errors)`, result)],
    };
  }
  const paused = pause(check, graph, errors, claim);
  const snapshot = claim.snapshot;
  if (snapshot === null || 'failed' in snapshot) {
    const reason =
      snapshot === null ? 'no snapshot was taken before your first edit' : snapshot.failed;
    const own = errors.filter((error) => error.file !== null && claim.files.includes(error.file));
    const lines = [
      `${reason}, so every error in the files you edited counts`,
      ...own.map((error) => error.text),
    ];
    return {
      ...none,
      paused,
      sections: own.length > 0 ? [{ check: `${check} (${claim.label})`, lines }] : [],
    };
  }
  const { own, unexplained } = attribute(errors, graph, claim, snapshot);
  const section = { check: `${check} (new since your first edit, ${claim.label})`, lines: own };
  return { sections: own.length > 0 ? [section] : [], paused, unexplained };
}
