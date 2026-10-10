import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import type ts from 'typescript';
import { ROOT } from './process.ts';

export type Typescript = typeof ts;

export interface Graph {
  readonly projects: readonly string[];
  readonly projectOf: (file: string) => string | null;
  readonly scopeOf: (project: string | null) => ReadonlySet<string>;
  readonly typescript: Typescript;
  readonly resolve: (specifier: string, from: string) => string | null;
  readonly withSyntaxErrors: (files: readonly string[]) => ReadonlySet<string>;
}

export type GraphResult =
  { readonly ok: true; readonly graph: Graph } | { readonly ok: false; readonly reason: string };

class TsconfigError extends Error {}

function readConfig(typescript: Typescript, file: string): Record<string, unknown> {
  const path = join(ROOT, file);
  if (!existsSync(path)) throw new TsconfigError(`${file} does not exist`);
  const read = typescript.readConfigFile(path, (file) => typescript.sys.readFile(file));
  if (read.error !== undefined) {
    const text = typescript.flattenDiagnosticMessageText(read.error.messageText, ' ');
    throw new TsconfigError(`${file}: ${text}`);
  }
  const config: unknown = read.config;
  if (typeof config !== 'object' || config === null) throw new TsconfigError(`${file} is empty`);
  return Object.fromEntries(Object.entries(config));
}

function referencesOf(typescript: Typescript, project: string): string[] {
  const references = readConfig(typescript, join(project, 'tsconfig.json'))['references'];
  if (references === undefined) return [];
  if (!Array.isArray(references)) throw new TsconfigError(`${project}: references is not a list`);
  return references.map((reference: unknown) => {
    const path =
      typeof reference === 'object' && reference !== null && 'path' in reference
        ? reference.path
        : null;
    if (typeof path !== 'string') throw new TsconfigError(`${project}: a reference has no path`);
    const target = relative(ROOT, resolve(ROOT, project, path));
    return target.endsWith('.json') ? dirname(target) : target;
  });
}

function compilerOptions(typescript: Typescript): ts.CompilerOptions {
  const options = readConfig(typescript, 'tsconfig.base.json')['compilerOptions'] ?? {};
  const converted = typescript.convertCompilerOptionsFromJson(options, ROOT);
  const error = converted.errors[0];
  if (error !== undefined) {
    const text = typescript.flattenDiagnosticMessageText(error.messageText, ' ');
    throw new TsconfigError(`tsconfig.base.json: ${text}`);
  }
  return converted.options;
}

function resolver(typescript: Typescript): (specifier: string, from: string) => string | null {
  const options = compilerOptions(typescript);
  return (specifier, from) => {
    const absolute = join(ROOT, from);
    const resolved = typescript.resolveModuleName(specifier, absolute, options, typescript.sys);
    const target = resolved.resolvedModule?.resolvedFileName;
    if (target === undefined) return null;
    const rel = relative(ROOT, target);
    const foreign = rel.startsWith('..') || rel.includes(`node_modules${sep}`);
    return foreign || rel.endsWith('.d.ts') ? null : rel;
  };
}

function syntaxChecker(typescript: Typescript): (files: readonly string[]) => ReadonlySet<string> {
  return (files) => {
    const absolute = files.map((file) => join(ROOT, file)).filter((file) => existsSync(file));
    const options = { noResolve: true, noLib: true, types: [], allowJs: true };
    const program = typescript.createProgram(absolute, options);
    return new Set(
      program
        .getSourceFiles()
        .filter((source) => program.getSyntacticDiagnostics(source).length > 0)
        .map((source) => relative(ROOT, source.fileName)),
    );
  };
}

function buildGraph(typescript: Typescript): Graph {
  const projects = referencesOf(typescript, '.');
  const references = new Map(
    projects.map((project) => [project, referencesOf(typescript, project)]),
  );
  const projectOf = (file: string): string | null => {
    const owners = projects.filter((project) => file.startsWith(`${project}${sep}`));
    return owners.sort((a, b) => b.length - a.length)[0] ?? null;
  };
  const scopeOf = (start: string | null): ReadonlySet<string> => {
    if (start === null) return new Set(projects);
    const scope = new Set([start]);
    for (let grew = true; grew;) {
      const added = projects.filter(
        (project) =>
          !scope.has(project) && (references.get(project) ?? []).some((ref) => scope.has(ref)),
      );
      for (const project of added) scope.add(project);
      grew = added.length > 0;
    }
    return scope;
  };
  return {
    typescript,
    projects,
    projectOf,
    scopeOf,
    resolve: resolver(typescript),
    withSyntaxErrors: syntaxChecker(typescript),
  };
}

export async function loadGraph(): Promise<GraphResult> {
  const typescript = (await import('typescript')).default;
  try {
    return { ok: true, graph: buildGraph(typescript) };
  } catch (error) {
    if (error instanceof TsconfigError) return { ok: false, reason: error.message };
    throw error;
  }
}
