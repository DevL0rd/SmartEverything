import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = createRequire(join(root, 'packages', 'harness', 'package.json'));
const target = join(root, 'apps', 'desktop', 'dist', 'service', 'node_modules');
const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  peerDependencies: z.record(z.string(), z.string()).optional(),
  peerDependenciesMeta: z
    .record(z.string(), z.object({ optional: z.boolean().optional() }))
    .optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  os: z.array(z.string()).optional(),
  cpu: z.array(z.string()).optional(),
});
const copied = new Map();
function manifest(directory) {
  return manifestSchema.parse(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')));
}
function folder(name, resolver) {
  for (const path of resolver.resolve.paths(name) ?? []) {
    const directory = join(path, name);
    if (existsSync(join(directory, 'package.json')) && manifest(directory).name === name)
      return directory;
  }
  const error = new Error(`Installed harness dependency ${name} has no matching manifest.`);
  error.code = 'MODULE_NOT_FOUND';
  throw error;
}
function accepts(values, actual) {
  return (
    values === undefined ||
    (!values.includes(`!${actual}`) &&
      (values.every((value) => value.startsWith('!')) || values.includes(actual)))
  );
}
function copy(name, resolver, parent = target, ancestors = new Map()) {
  const directory = folder(name, resolver);
  const pkg = manifest(directory);
  if (!accepts(pkg.os, process.platform) || !accepts(pkg.cpu, process.arch)) return;
  if (ancestors.get(name) === pkg.version || copied.get(name) === pkg.version) return;
  const nested = copied.has(name);
  const destination = join(nested ? join(parent, 'node_modules') : target, name);
  if (!nested) copied.set(name, pkg.version);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(directory, destination, {
    recursive: true,
    dereference: true,
    filter: (path) => path !== join(directory, 'node_modules'),
  });
  const lineage = new Map(ancestors);
  lineage.set(name, pkg.version);
  const local = createRequire(join(directory, 'package.json'));
  for (const dependency of Object.keys(pkg.dependencies ?? {}))
    copy(dependency, local, destination, lineage);
  for (const dependency of Object.keys(pkg.peerDependencies ?? {}))
    if (pkg.peerDependenciesMeta?.[dependency]?.optional !== true)
      copy(dependency, local, destination, lineage);
  for (const dependency of Object.keys(pkg.optionalDependencies ?? {})) {
    try {
      folder(dependency, local);
    } catch (cause) {
      if (cause?.code === 'MODULE_NOT_FOUND') continue;
      throw cause;
    }
    copy(dependency, local, destination, lineage);
  }
}
const harness = manifest(join(root, 'packages', 'harness'));
for (const name of Object.keys(harness.dependencies ?? {}))
  if (
    name.startsWith('@deepseek-ai/') ||
    name.startsWith('@earendil-works/') ||
    name.startsWith('dsh-plugin-codegraph-') ||
    name === 'web-tree-sitter' ||
    name === 'tree-sitter-wasms' ||
    name === 'jose'
  )
    copy(name, source);
process.stdout.write(
  `Packaged ${String(copied.size)} installed harness runtime dependencies and current-platform optional assets.\n`,
);
