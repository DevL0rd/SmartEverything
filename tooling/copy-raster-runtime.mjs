import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const resolver = createRequire(join(root, 'apps', 'hub', 'package.json'));
const destination = join(root, 'apps', 'desktop', 'dist', 'service', 'node_modules');
const manifestSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional(),
  os: z.array(z.string()).optional(),
  cpu: z.array(z.string()).optional(),
});
const copied = new Set();
function folder(name, local) {
  for (const path of local.resolve.paths(name) ?? []) {
    const directory = join(path, name);
    const file = join(directory, 'package.json');
    if (existsSync(file)) return directory;
  }
  throw new Error(`Installed raster dependency ${name} is missing.`);
}
function accepts(values, actual) {
  return (
    values === undefined ||
    (!values.includes(`!${actual}`) &&
      (values.every((value) => value.startsWith('!')) || values.includes(actual)))
  );
}
function copy(name, local, optional = false) {
  if (copied.has(name)) return;
  let directory;
  try {
    directory = folder(name, local);
  } catch (cause) {
    if (
      optional &&
      cause instanceof Error &&
      cause.message === `Installed raster dependency ${name} is missing.`
    )
      return;
    throw cause;
  }
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')),
  );
  if (manifest.name !== name)
    throw new Error(`Raster dependency ${name} has an unexpected manifest.`);
  if (!accepts(manifest.os, process.platform) || !accepts(manifest.cpu, process.arch)) return;
  copied.add(name);
  const target = join(destination, name);
  rmSync(target, { force: true, recursive: true });
  mkdirSync(dirname(target), { recursive: true });
  cpSync(directory, target, {
    recursive: true,
    dereference: true,
    filter: (path) => path !== join(directory, 'node_modules'),
  });
  const nested = createRequire(join(directory, 'package.json'));
  for (const dependency of Object.keys(manifest.dependencies ?? {})) copy(dependency, nested);
  for (const dependency of Object.keys(manifest.optionalDependencies ?? {}))
    copy(dependency, nested, true);
}
copy('sharp', resolver);
process.stdout.write(
  `Packaged ${String(copied.size)} installed raster dependencies; plain Node remains an explicit platform runtime requirement.\n`,
);
