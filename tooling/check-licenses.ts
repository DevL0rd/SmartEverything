import { Logger } from '@smarteverything/logging';
import {
  isPermitted,
  productionPackages,
  readPolicy,
  unusedOverrides,
  type ProductionPackage,
} from './licence-policy.ts';

const log = new Logger('tool.licenses');

const policy = readPolicy();
const allowed: ReadonlySet<string> = new Set(policy.allowedLicenses);
const packages = productionPackages(policy);

function refusedBy(list: readonly ProductionPackage[]): readonly string[] {
  return [
    ...new Set(
      list
        .filter((one) => !isPermitted(one.licence, allowed))
        .map((one) => `${one.name} (${one.licence})`),
    ),
  ];
}

const refused = refusedBy(packages);
const stale = unusedOverrides(policy, packages);

if (stale.length > 0) {
  log.warn('licenses.override_unused', { count: stale.length, stale });
}
if (refused.length > 0) {
  log.warn('licenses.refused', { count: refused.length, refused });
}
if (refused.length > 0 || stale.length > 0) {
  process.exitCode = 1;
} else {
  log.info('licenses.all_permitted');
}
