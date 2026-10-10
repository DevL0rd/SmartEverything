import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type ts from 'typescript';
import type { Graph, Typescript } from './graph.ts';
import { ROOT } from './process.ts';

export type Originals = Readonly<Record<string, string | null>>;
type Change = ReadonlySet<string> | 'all';
type Named = readonly [string, string];

interface Import {
  readonly from: string | null;
  readonly names: readonly string[] | 'namespace';
}

interface Reexport {
  readonly from: string | null;
  readonly names: ReadonlyMap<string, string> | 'all';
}

interface ModuleInfo {
  readonly imports: readonly Import[];
  readonly reexports: readonly Reexport[];
  readonly declared: ReadonlySet<string>;
}

interface Declarations {
  readonly locals: Map<string, string>;
  readonly exported: Map<string, string>;
  readonly reexportText: string;
}

function readSource(file: string): string | null {
  const path = join(ROOT, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function parse(typescript: Typescript, file: string, text: string): ts.SourceFile {
  return typescript.createSourceFile(file, text, typescript.ScriptTarget.Latest, true);
}

function exportFlags(
  typescript: Typescript,
  node: ts.Node,
): { exported: boolean; isDefault: boolean } {
  const list = typescript.canHaveModifiers(node) ? (typescript.getModifiers(node) ?? []) : [];
  const kinds = list.map((modifier) => modifier.kind);
  const { ExportKeyword, DefaultKeyword } = typescript.SyntaxKind;
  return { exported: kinds.includes(ExportKeyword), isDefault: kinds.includes(DefaultKeyword) };
}

function variableTexts(
  typescript: Typescript,
  source: ts.SourceFile,
  node: ts.VariableStatement,
): Named[] {
  return node.declarationList.declarations.flatMap((declaration): Named[] =>
    typescript.isIdentifier(declaration.name)
      ? [[declaration.name.text, (declaration.type ?? declaration).getText(source)]]
      : [],
  );
}

function namedText(typescript: Typescript, source: ts.SourceFile, node: ts.Statement): Named[] {
  const named =
    typescript.isClassDeclaration(node) ||
    typescript.isInterfaceDeclaration(node) ||
    typescript.isTypeAliasDeclaration(node) ||
    typescript.isEnumDeclaration(node);
  if (named) return [[node.name?.text ?? 'default', node.getText(source)]];
  return typescript.isExportAssignment(node) ? [['default', node.getText(source)]] : [];
}

function declaredTexts(typescript: Typescript, source: ts.SourceFile, node: ts.Statement): Named[] {
  if (typescript.isFunctionDeclaration(node)) {
    const end = node.body === undefined ? node.end : node.body.getStart(source);
    return [[node.name?.text ?? 'default', source.text.slice(node.getStart(source), end)]];
  }
  if (typescript.isVariableStatement(node)) return variableTexts(typescript, source, node);
  return namedText(typescript, source, node);
}

function localExports(
  typescript: Typescript,
  source: ts.SourceFile,
  node: ts.ExportDeclaration,
): Named[] {
  const clause = node.exportClause;
  if (clause === undefined || !typescript.isNamedExports(clause)) return [];
  return clause.elements.map((element): Named => [
    element.name.text,
    (element.propertyName ?? element.name).getText(source),
  ]);
}

function declarationsOf(typescript: Typescript, file: string, text: string): Declarations {
  const source = parse(typescript, file, text);
  const locals = new Map<string, string>();
  const exported = new Map<string, string>();
  const reexports: string[] = [];
  for (const node of source.statements) {
    if (typescript.isExportDeclaration(node)) {
      if (node.moduleSpecifier !== undefined) reexports.push(node.getText(source));
      for (const [name, local] of localExports(typescript, source, node)) exported.set(name, local);
      continue;
    }
    const flags = exportFlags(typescript, node);
    const isExported = flags.exported || typescript.isExportAssignment(node);
    for (const [name, declaration] of declaredTexts(typescript, source, node)) {
      locals.set(name, declaration);
      if (isExported) exported.set(flags.isDefault ? 'default' : name, name);
    }
  }
  return { locals, exported, reexportText: reexports.sort().join('\n') };
}

function withDependencies(locals: ReadonlyMap<string, string>, start: string): string {
  const seen = new Set([start]);
  const queue = [start];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    const words = locals.get(name)?.match(/[A-Za-z_$][\w$]*/g) ?? [];
    for (const word of words.filter((candidate) => locals.has(candidate) && !seen.has(candidate))) {
      seen.add(word);
      queue.push(word);
    }
  }
  return [...seen].flatMap((name) => locals.get(name) ?? []).join('\n');
}

function signatures(declarations: Declarations): Map<string, string> {
  const pairs = [...declarations.exported].map(([name, local]): Named => [
    name,
    withDependencies(declarations.locals, local),
  ]);
  return new Map(pairs);
}

export function changedExports(
  typescript: Typescript,
  file: string,
  before: string | null | undefined,
): Change {
  const after = readSource(file);
  if (before === undefined || before === null || after === null) return 'all';
  const old = declarationsOf(typescript, file, before);
  const now = declarationsOf(typescript, file, after);
  if (old.reexportText !== now.reexportText) return 'all';
  const oldSignatures = signatures(old);
  const newSignatures = signatures(now);
  const names = new Set([...oldSignatures.keys(), ...newSignatures.keys()]);
  return new Set([...names].filter((name) => oldSignatures.get(name) !== newSignatures.get(name)));
}

function importOf(
  typescript: Typescript,
  source: ts.SourceFile,
  node: ts.ImportDeclaration,
  from: string | null,
): Import {
  const clause = node.importClause;
  const bindings = clause?.namedBindings;
  if (bindings !== undefined && typescript.isNamespaceImport(bindings))
    return { from, names: 'namespace' };
  const elements =
    bindings !== undefined && typescript.isNamedImports(bindings) ? bindings.elements : [];
  const names = elements.map((element) => (element.propertyName ?? element.name).getText(source));
  return { from, names: clause?.name === undefined ? names : ['default', ...names] };
}

function reexportOf(
  typescript: Typescript,
  source: ts.SourceFile,
  node: ts.ExportDeclaration,
  from: string | null,
): Reexport {
  const clause = node.exportClause;
  if (clause === undefined) return { from, names: 'all' };
  if (!typescript.isNamedExports(clause))
    return { from, names: new Map([[clause.name.getText(source), '*']]) };
  return { from, names: new Map(localExports(typescript, source, node)) };
}

function moduleInfo(graph: Graph, file: string): ModuleInfo {
  const typescript = graph.typescript;
  const text = readSource(file) ?? '';
  const source = parse(typescript, file, text);
  const imports: Import[] = [];
  const reexports: Reexport[] = [];
  for (const node of source.statements) {
    const isImport = typescript.isImportDeclaration(node);
    if (!isImport && !typescript.isExportDeclaration(node)) continue;
    const specifier = node.moduleSpecifier;
    if (specifier === undefined || !typescript.isStringLiteral(specifier)) continue;
    const from = graph.resolve(specifier.text, file);
    if (isImport) imports.push(importOf(typescript, source, node, from));
    else reexports.push(reexportOf(typescript, source, node, from));
  }
  return {
    imports,
    reexports,
    declared: new Set(declarationsOf(typescript, file, text).exported.keys()),
  };
}

export class Attribution {
  private readonly graph: Graph;
  private readonly changes: ReadonlyMap<string, Change>;
  private readonly modules = new Map<string, ModuleInfo>();
  private readonly uses = new Map<string, boolean>();

  constructor(graph: Graph, changes: ReadonlyMap<string, Change>) {
    this.graph = graph;
    this.changes = changes;
  }

  private info(file: string): ModuleInfo {
    const known = this.modules.get(file);
    if (known !== undefined) return known;
    const found = moduleInfo(this.graph, file);
    this.modules.set(file, found);
    return found;
  }

  private throughReexport(reexport: Reexport, name: string, seen: Set<string>): boolean {
    if (reexport.from === null) return false;
    if (reexport.names === 'all') return this.exportAffected(reexport.from, name, seen);
    const source = reexport.names.get(name);
    if (source === undefined) return false;
    if (source === '*') return this.anyAffected(reexport.from, seen);
    return this.exportAffected(reexport.from, source, seen);
  }

  private exportAffected(file: string, name: string, seen: Set<string>): boolean {
    const key = `${file}#${name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    const change = this.changes.get(file);
    if (change === 'all' || change?.has(name) === true) return true;
    const info = this.info(file);
    if (info.reexports.some((reexport) => this.throughReexport(reexport, name, seen))) return true;
    return info.declared.has(name) && this.usesChanged(file, seen);
  }

  private anyAffected(file: string, seen: Set<string>): boolean {
    if (seen.has(`${file}#*`)) return false;
    seen.add(`${file}#*`);
    if (this.changes.has(file)) return true;
    const sources = this.info(file).reexports.flatMap((reexport) => reexport.from ?? []);
    return sources.some((source) => this.anyAffected(source, seen)) || this.usesChanged(file, seen);
  }

  usesChanged(file: string, seen = new Set<string>()): boolean {
    const known = this.uses.get(file);
    if (known !== undefined) return known;
    this.uses.set(file, false);
    const found = this.info(file).imports.some(({ from, names }) => {
      if (from === null) return false;
      if (names === 'namespace') return this.anyAffected(from, seen);
      return names.some((name) => this.exportAffected(from, name, seen));
    });
    this.uses.set(file, found);
    return found;
  }
}
