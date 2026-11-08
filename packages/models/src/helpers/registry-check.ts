import type { ModelSpec } from '@smarteverything/domain';
import { checkAuthoring, type AuthoringOptions, type AuthoringProblem } from './authoring';

export interface RegistryProblem extends AuthoringProblem {
  readonly id: string;
}

function identityProblems(specs: readonly ModelSpec[]): RegistryProblem[] {
  const owners = new Map<string, string>();
  const out: RegistryProblem[] = [];
  const claim = (name: string, id: string, path: readonly (string | number)[]): void => {
    const owner = owners.get(name);
    if (owner === undefined) owners.set(name, id);
    else out.push({ id, path, message: `${name} is already used by ${owner}` });
  };
  for (const spec of specs) claim(spec.id, spec.id, ['id']);
  for (const spec of specs) {
    (spec.meta?.aliases ?? []).forEach((alias, index) => {
      claim(alias, spec.id, ['meta', 'aliases', index]);
    });
  }
  return out;
}

export function checkRegistry(
  specs: readonly unknown[],
  options: AuthoringOptions = {},
): readonly RegistryProblem[] {
  const reports = specs.map((spec) => checkAuthoring(spec, options));
  const problems = reports.flatMap((report, index) =>
    report.problems.map((problem) => ({
      id: report.spec?.id ?? `#${String(index)}`,
      ...problem,
    })),
  );
  const valid = reports.flatMap((report) => (report.spec === undefined ? [] : [report.spec]));
  return [...problems, ...identityProblems(valid)];
}
