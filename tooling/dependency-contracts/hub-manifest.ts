import { z } from 'zod';
import { readRepositoryJson } from './contract-helpers';

const HUB_MANIFEST = z.object({
  dependencies: z.record(z.string(), z.string()),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

export function hubDeclaredVersion(packageName: string): string {
  const manifest = readRepositoryJson('apps/hub/package.json', HUB_MANIFEST);
  const declared = manifest.dependencies[packageName] ?? manifest.devDependencies[packageName];
  if (declared === undefined) {
    throw new Error(`Package "${packageName}" is not declared in apps/hub/package.json`);
  }
  return declared;
}
