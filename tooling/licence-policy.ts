import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const REPOSITORY_ROOT = join(import.meta.dirname, '..');

const POLICY = z.object({
  allowedLicenses: z.array(z.string().min(1)).min(1),
  overrides: z.record(z.string().min(1), z.string().min(1)).default({}),
});

const REPORT = z.record(
  z.string(),
  z.array(z.object({ name: z.string().min(1), versions: z.array(z.string().min(1)).min(1) })),
);

export type LicencePolicy = z.infer<typeof POLICY>;

export interface ProductionPackage {
  readonly name: string;
  readonly version: string;
  readonly licence: string;
}

export function readPolicy(): LicencePolicy {
  const raw: unknown = JSON.parse(readFileSync(join(REPOSITORY_ROOT, '.licenserc.json'), 'utf8'));
  return POLICY.parse(raw);
}

export function productionPackages(policy: LicencePolicy): readonly ProductionPackage[] {
  const shown = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return Object.entries(REPORT.parse(JSON.parse(shown))).flatMap(([licence, listed]) =>
    listed.flatMap((entry) =>
      entry.versions.map((version) => ({
        name: entry.name,
        version,
        licence: policy.overrides[entry.name] ?? licence,
      })),
    ),
  );
}

export function isPermitted(expression: string, allowed: ReadonlySet<string>): boolean {
  const bare = expression.replace(/^\((.*)\)$/u, '$1');
  if (bare.includes(' OR ')) {
    return bare.split(' OR ').some((one) => isPermitted(one, allowed));
  }
  return bare.split(' AND ').every((one) => allowed.has(one.trim()));
}

export function unusedOverrides(
  policy: LicencePolicy,
  packages: readonly ProductionPackage[],
): readonly string[] {
  const installed = new Set(packages.map((one) => one.name));
  return Object.keys(policy.overrides).filter((name) => !installed.has(name));
}
