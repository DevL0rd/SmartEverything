import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

const COMPONENT_NAME = /^[A-Z][A-Za-z0-9]*$/u;
const CONSTANT_NAME = /^[A-Z0-9_]+$/u;
const SOURCE_FILE = /\.tsx?$/u;
const OMIT_FILE = /\.(test|d|native)\.|^index\.ts$/u;

function componentFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => Number(left.name > right.name) - Number(left.name < right.name))
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return componentFiles(path);
      return SOURCE_FILE.test(entry.name) && !OMIT_FILE.test(entry.name) ? [path] : [];
    });
}

function isComponent(symbol, checker, excluded) {
  const name = symbol.getName();
  if (!COMPONENT_NAME.test(name) || CONSTANT_NAME.test(name) || excluded.has(name)) return false;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const [declaration] = resolved.getDeclarations() ?? [];
  return (
    declaration !== undefined &&
    (ts.isFunctionDeclaration(declaration) ||
      ts.isClassDeclaration(declaration) ||
      ts.isVariableDeclaration(declaration))
  );
}

function collectExports(files, excluded) {
  const program = ts.createProgram(files, {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });
  const checker = program.getTypeChecker();
  const seen = new Set();
  return files.flatMap((file) => {
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`Cannot read component source ${file}`);
    const module = checker.getSymbolAtLocation(source);
    if (module === undefined) return [];
    const names = checker.getExportsOfModule(module).flatMap((symbol) => {
      const name = symbol.getName();
      if (seen.has(name) || !isComponent(symbol, checker, excluded)) return [];
      seen.add(name);
      return [name];
    });
    return names.length === 0 ? [] : [[file, names.sort()]];
  });
}

export function kitEntrySource(designDirectory) {
  const components = join(designDirectory, '..', 'apps', 'app', 'src', 'components');
  const files = componentFiles(components);
  const excluded = new Set(
    JSON.parse(readFileSync(join(designDirectory, 'kit-exclude.json'), 'utf8')),
  );
  const lines = collectExports(files, excluded)
    .map(([file, names]) => [relative(designDirectory, file).split(sep).join('/'), names])
    .sort()
    .map(
      ([specifier, names]) =>
        `export { ${names.join(', ')} } from '${specifier.replace(SOURCE_FILE, '')}';`,
    );
  return [...lines, "export * from './kit-extras';", ''].join('\n');
}

async function formattedEntry(designDirectory, entry) {
  const config = await resolveConfig(entry);
  if (config === null) throw new Error(`Cannot resolve formatting configuration for ${entry}`);
  return format(kitEntrySource(designDirectory), { ...config, filepath: entry });
}

async function checkKitEntry(designDirectory) {
  const entry = join(designDirectory, 'kit-entry.ts');
  const expected = await formattedEntry(designDirectory, entry);
  if (readFileSync(entry, 'utf8') !== expected) {
    throw new Error(
      'Design Sync kit exports changed. Run node .design-sync/kit-entry.mjs --write.',
    );
  }
}

if (import.meta.main) {
  const designDirectory = dirname(fileURLToPath(import.meta.url));
  const entry = join(designDirectory, 'kit-entry.ts');
  const [action] = process.argv.slice(2);
  if (action === '--write') writeFileSync(entry, await formattedEntry(designDirectory, entry));
  else if (action === '--check') await checkKitEntry(designDirectory);
  else throw new Error('Expected --write or --check.');
}
