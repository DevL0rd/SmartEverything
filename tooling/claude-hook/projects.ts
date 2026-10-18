import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { z } from 'zod';
import { parseJson } from './input.ts';
import { ROOT } from './process.ts';
import { affectsTypes, owningProject } from './types.ts';

const tsconfig = z.object({ references: z.array(z.object({ path: z.string() })).optional() });

export interface Scope {
  readonly all: boolean;
  readonly projects: readonly string[];
  readonly tops: readonly string[];
}

export type Graph = ReadonlyMap<string, readonly string[]>;

function configPath(project: string): string {
  return join(ROOT, project, 'tsconfig.json');
}

function referencesOf(project: string): string[] {
  const path = configPath(project);
  if (!existsSync(path)) return [];
  const parsed = parseJson(readFileSync(path, 'utf8'));
  const config = parsed.ok ? tsconfig.safeParse(parsed.value) : null;
  if (config?.success !== true) return [];
  return (config.data.references ?? []).map((reference) => {
    const target = reference.path.endsWith('.json') ? join(reference.path, '..') : reference.path;
    return normalize(join(project, target));
  });
}

export function buildGraph(): Graph {
  const graph = new Map<string, readonly string[]>();
  const pending = referencesOf('.');
  for (let project = pending.pop(); project !== undefined; project = pending.pop()) {
    if (graph.has(project)) continue;
    const references = referencesOf(project);
    graph.set(project, references);
    pending.push(...references);
  }
  return graph;
}

function closure(
  start: Iterable<string>,
  edges: (project: string) => readonly string[],
): Set<string> {
  const seen = new Set<string>();
  const pending = [...start];
  for (let project = pending.pop(); project !== undefined; project = pending.pop()) {
    if (seen.has(project)) continue;
    seen.add(project);
    pending.push(...edges(project));
  }
  return seen;
}

function dependentsClosure(graph: Graph, owners: Iterable<string>): Set<string> {
  const dependents = (project: string): string[] =>
    [...graph].filter(([, references]) => references.includes(project)).map(([name]) => name);
  return closure(owners, dependents);
}

export function topsOf(graph: Graph, members: ReadonlySet<string>): string[] {
  const covered = new Set<string>();
  for (const member of members) {
    const below = closure(graph.get(member) ?? [], (project) => graph.get(project) ?? []);
    for (const project of below) covered.add(project);
  }
  return [...members].filter((member) => !covered.has(member)).sort();
}

export function scopeOf(files: readonly string[], graph: Graph = buildGraph()): Scope {
  const typed = files.filter(affectsTypes);
  const owners = typed.map((file) => owningProject(file));
  if (typed.length === 0) return { all: false, projects: [], tops: [] };
  if (owners.some((owner) => owner === null)) return { all: true, projects: [], tops: [] };
  const known = owners.filter((owner) => owner !== null);
  const projects = dependentsClosure(graph, known);
  return { all: false, projects: [...projects].sort(), tops: topsOf(graph, projects) };
}
