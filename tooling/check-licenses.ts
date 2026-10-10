import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { Logger } from '@smarteverything/logging';

const log = new Logger('tool.licenses');

const policySchema = z.object({ allowedLicenses: z.array(z.string().min(1)).min(1) });
const reportSchema = z.record(z.string(), z.array(z.object({ name: z.string() })));

function allowedLicenses(): ReadonlySet<string> {
  const raw: unknown = JSON.parse(readFileSync('.licenserc.json', 'utf8'));
  return new Set(policySchema.parse(raw).allowedLicenses);
}

function productionLicenses(): z.infer<typeof reportSchema> {
  const shown = execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return reportSchema.parse(JSON.parse(shown));
}

function isPermitted(expression: string, allowed: ReadonlySet<string>): boolean {
  const bare = expression.replace(/^\((.*)\)$/u, '$1');
  if (bare.includes(' OR ')) {
    return bare.split(' OR ').some((one) => isPermitted(one, allowed));
  }
  return bare.split(' AND ').every((one) => allowed.has(one.trim()));
}

const allowed = allowedLicenses();
const refused = Object.entries(productionLicenses())
  .filter(([license]) => !isPermitted(license, allowed))
  .flatMap(([license, packages]) => packages.map((one) => `${one.name} (${license})`));

if (refused.length > 0) {
  log.warn('licenses.refused', { count: refused.length, refused });
  process.exitCode = 1;
} else {
  log.info('licenses.all_permitted');
}
