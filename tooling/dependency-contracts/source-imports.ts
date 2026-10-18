import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { repositoryFile } from './versions';

const SOURCE_FILE = /\.(?:ts|tsx|cts|mts|mjs)$/u;
const SKIPPED_FOLDER = new Set([
  'node_modules',
  'dist',
  'dist-types',
  'out',
  'build',
  'android',
  'ios',
  '.expo',
  'dependency-contracts',
]);
function workspaceFolders(parent: string): readonly string[] {
  return readdirSync(repositoryFile(parent), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(parent, entry.name));
}

const LAZY_LOADERS = new Set(['createLazyRequire', 'require']);

export interface ImportedSurface {
  readonly specifier: string;
  readonly packageName: string;
  readonly names: ReadonlySet<string>;
}

function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith('.') || specifier.startsWith('node:')) return undefined;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function sourceFilesOf(folder: string): readonly string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return SKIPPED_FOLDER.has(entry.name) ? [] : sourceFilesOf(path);
    return SOURCE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}

function stringArgument(node: ts.CallExpression): string | undefined {
  const [first] = node.arguments;
  return first !== undefined && ts.isStringLiteral(first) ? first.text : undefined;
}

function isLazyLoad(node: ts.CallExpression, file: ts.SourceFile): boolean {
  return (
    node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    LAZY_LOADERS.has(node.expression.getText(file))
  );
}

function valueNames(clause: ts.ImportClause): readonly string[] {
  const names = clause.name === undefined ? [] : ['default'];
  const bindings = clause.namedBindings;
  if (bindings === undefined || ts.isNamespaceImport(bindings)) return names;
  return [
    ...names,
    ...bindings.elements
      .filter((el) => !el.isTypeOnly)
      .map((el) => (el.propertyName ?? el.name).text),
  ];
}

function collect(file: ts.SourceFile, into: Map<string, Set<string>>): void {
  const record = (specifier: string, names: readonly string[]): void => {
    if (packageNameOf(specifier) === undefined) return;
    const seen = into.get(specifier) ?? new Set<string>();
    names.forEach((name) => seen.add(name));
    into.set(specifier, seen);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.phaseModifier !== ts.SyntaxKind.TypeKeyword)
        record(node.moduleSpecifier.text, clause === undefined ? [] : valueNames(clause));
    } else if (ts.isCallExpression(node) && isLazyLoad(node, file)) {
      const specifier = stringArgument(node);
      if (specifier !== undefined) record(specifier, []);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

export function importedSurfaces(): readonly ImportedSurface[] {
  const imports = new Map<string, Set<string>>();
  const folders = ['apps/hub', 'apps/desktop', 'tooling', ...workspaceFolders('packages')];
  for (const path of folders.flatMap((folder) => sourceFilesOf(repositoryFile(folder)))) {
    collect(
      ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true),
      imports,
    );
  }
  return [...imports.entries()]
    .flatMap(([specifier, names]) => {
      const packageName = packageNameOf(specifier);
      return packageName === undefined ? [] : [{ specifier, packageName, names }];
    })
    .sort((a, b) => a.specifier.localeCompare(b.specifier));
}
