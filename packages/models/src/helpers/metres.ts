import { MODEL_SPEC_LIMITS, type ModelSpec } from '@smarteverything/domain';
import { paramPresets, resolveBindable, type ModelParamValues } from './estimate';

export interface AuthoringProblem {
  readonly path: readonly (string | number)[];
  readonly message: string;
}

const METRE_KEYS: ReadonlySet<string> = new Set([
  'width',
  'height',
  'depth',
  'radius',
  'topRadius',
  'bottomRadius',
  'bevel',
  'length',
  'tube',
  'innerRadius',
  'outerRadius',
  'spacing',
  'holeRadius',
  'x',
  'y',
  'cx',
  'cy',
  'c1x',
  'c1y',
  'c2x',
  'c2y',
  'rx',
  'ry',
  'profile',
  'points',
  'position',
  'size',
]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bindingOf(value: Readonly<Record<string, unknown>>): string | undefined {
  const name = value['param'];
  return typeof name === 'string' ? name : undefined;
}

function numberOf(
  value: Readonly<Record<string, unknown>>,
  name: string,
  params: ModelParamValues,
): number {
  const scale = value['scale'];
  const offset = value['offset'];
  return resolveBindable(
    {
      param: name,
      scale: typeof scale === 'number' ? scale : undefined,
      offset: typeof offset === 'number' ? offset : undefined,
    },
    params,
  );
}

function checkNumber(
  value: number,
  path: readonly (string | number)[],
  out: AuthoringProblem[],
): void {
  if (!Number.isFinite(value)) out.push({ path, message: 'metres are finite' });
  else if (Math.abs(value) > MODEL_SPEC_LIMITS.metres) {
    out.push({ path, message: `metres lie within ${String(MODEL_SPEC_LIMITS.metres)}` });
  }
}

interface Scan {
  readonly params: ModelParamValues;
  readonly out: AuthoringProblem[];
}

function walk(
  value: unknown,
  path: readonly (string | number)[],
  metres: boolean,
  scan: Scan,
): void {
  if (typeof value === 'number') {
    if (metres) checkNumber(value, path, scan.out);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, [...path, index], metres, scan);
    });
    return;
  }
  if (!isRecord(value)) return;
  const name = bindingOf(value);
  if (name !== undefined) {
    if (metres) checkNumber(numberOf(value, name, scan.params), path, scan.out);
    return;
  }
  for (const [key, inner] of Object.entries(value)) {
    walk(inner, [...path, key], METRE_KEYS.has(key), scan);
  }
}

export function metreProblems(
  spec: Pick<ModelSpec, 'parts' | 'params'>,
): readonly AuthoringProblem[] {
  const seen = new Set<string>();
  const out: AuthoringProblem[] = [];
  for (const [, params] of paramPresets(spec)) {
    const found: AuthoringProblem[] = [];
    walk(spec.parts, ['parts'], false, { params, out: found });
    for (const problem of found) {
      const key = `${problem.path.join('.')}|${problem.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(problem);
    }
  }
  return out;
}
