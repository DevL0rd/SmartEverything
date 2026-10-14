import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRequire = createRequire(join(root, 'apps', 'hub', 'package.json'));
const target = join(root, 'apps', 'desktop', 'dist', 'service', 'node_modules');
const copied = new Map();

function packageFolder(name, resolver) {
  let file;
  try {
    file = resolver.resolve(`${name}/package.json`);
  } catch {
    file = resolver.resolve(name);
  }
  let directory = dirname(file);
  while (directory !== dirname(directory)) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === name)
      return directory;
    directory = dirname(directory);
  }
  throw new Error(`The installed Claude runtime dependency ${name} could not be located.`);
}

function copyPackage(name, resolver, parent = target, ancestors = new Map()) {
  const directory = packageFolder(name, resolver);
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  if (ancestors.get(name) === manifest.version || copied.get(name) === manifest.version) return;
  const nested = copied.has(name);
  const destination = join(nested ? join(parent, 'node_modules') : target, name);
  if (!nested) copied.set(name, manifest.version);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(directory, destination, {
    recursive: true,
    dereference: true,
    filter: (source) => source !== join(directory, 'node_modules'),
  });
  const path = new Map(ancestors);
  path.set(name, manifest.version);
  const localRequire = createRequire(join(directory, 'package.json'));
  for (const dependency of Object.keys(manifest.dependencies ?? {}))
    copyPackage(dependency, localRequire, destination, path);
  for (const dependency of Object.keys(manifest.peerDependencies ?? {})) {
    if (!manifest.peerDependenciesMeta?.[dependency]?.optional)
      copyPackage(dependency, localRequire, destination, path);
  }
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) {
    try {
      packageFolder(dependency, localRequire);
    } catch (cause) {
      if (cause?.code === 'MODULE_NOT_FOUND') continue;
      throw cause;
    }
    copyPackage(dependency, localRequire, destination, path);
  }
}

copyPackage('@anthropic-ai/claude-agent-sdk', sourceRequire);
copyPackage('ts-json-schema-generator', sourceRequire);
process.stdout.write(
  `Packaged ${String(copied.size)} installed Claude runtime dependencies with unmodified optional binaries.\n`,
);
