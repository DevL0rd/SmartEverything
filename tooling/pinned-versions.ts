import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const WORKSPACE_FOLDER = /^\s+-\s+(\S+)\/\*\s*$/gm;

const PINNED = z.union([z.string().regex(EXACT_VERSION), z.literal('workspace:*')]);

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

const SPECS = z.record(z.string(), z.string()).default({});

const MANIFEST = z.looseObject({
  dependencies: SPECS,
  devDependencies: SPECS,
  optionalDependencies: SPECS,
});

export function workspaceManifests(root: string): readonly string[] {
  const folders = [
    ...readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').matchAll(WORKSPACE_FOLDER),
  ].map((match) => match[1] ?? '');
  const members = folders.flatMap((folder) =>
    readdirSync(join(root, folder), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(folder, entry.name, 'package.json')),
  );
  return ['package.json', ...members.filter((path) => existsSync(join(root, path))).sort()];
}

export function unpinnedDependencies(path: string, manifest: unknown): readonly string[] {
  const parsed = MANIFEST.parse(manifest);
  return SECTIONS.flatMap((section) =>
    Object.entries(parsed[section])
      .filter(([, spec]) => !PINNED.safeParse(spec).success)
      .map(([name, spec]) => `${path} ${section}.${name}@${spec}`),
  );
}
