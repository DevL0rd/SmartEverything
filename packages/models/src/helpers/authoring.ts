import {
  MODEL_SPEC,
  isModelSignal,
  specSignalProblems,
  type ModelSpec,
} from '@smarteverything/domain';
import { MODEL_LODS, estimateSpecTriangles, paramPresets, type ModelLod } from './estimate';
import { metreProblems, type AuthoringProblem } from './metres';

export type { AuthoringProblem } from './metres';

export const AUTHORING_TRIANGLE_TARGETS: Readonly<Record<ModelLod, number>> = {
  0: 1500,
  1: 6000,
  2: 25000,
};

export const AUTHORING_MATERIAL_SLOTS = { body: 3, accent: 1 } as const;

export const ACCENT_SLOT = 'accent';

export interface AuthoringOptions {
  readonly triangleTargets?: Readonly<Record<ModelLod, number>>;
  readonly capabilitySources?: boolean;
}

export interface AuthoringReport {
  readonly spec: ModelSpec | undefined;
  readonly triangles: Readonly<Record<ModelLod, number>>;
  readonly problems: readonly AuthoringProblem[];
}

const NO_TRIANGLES: Readonly<Record<ModelLod, number>> = { 0: 0, 1: 0, 2: 0 };

function slotProblems(spec: ModelSpec): AuthoringProblem[] {
  const slots = Object.keys(spec.materials);
  const body = slots.filter((slot) => slot !== ACCENT_SLOT).length;
  return body > AUTHORING_MATERIAL_SLOTS.body
    ? [
        {
          path: ['materials'],
          message: `at most ${String(AUTHORING_MATERIAL_SLOTS.body)} material slots plus ${ACCENT_SLOT}, found ${String(body)}`,
        },
      ]
    : [];
}

function capabilityProblems(spec: ModelSpec): AuthoringProblem[] {
  const channels = (spec.channels ?? []).flatMap((channel, index) =>
    typeof channel.source === 'string'
      ? []
      : [
          {
            path: ['channels', index, 'source'],
            message: `capability source ${channel.source.capability} needs a plugin model`,
          },
        ],
  );
  const states = Object.entries(spec.states ?? {}).flatMap(([name, state]) =>
    Object.keys(state)
      .filter((key) => !isModelSignal(key))
      .map((key) => ({ path: ['states', name, key], message: `unknown signal ${key}` })),
  );
  return [...channels, ...states];
}

function triangleCounts(spec: ModelSpec): Record<ModelLod, number> {
  const counts: Record<ModelLod, number> = { 0: 0, 1: 0, 2: 0 };
  for (const lod of MODEL_LODS) {
    counts[lod] = Math.max(
      ...paramPresets(spec).map(([, params]) => estimateSpecTriangles(spec, lod, params)),
    );
  }
  return counts;
}

function triangleProblems(
  counts: Readonly<Record<ModelLod, number>>,
  targets: Readonly<Record<ModelLod, number>>,
): AuthoringProblem[] {
  return MODEL_LODS.filter((lod) => counts[lod] > targets[lod]).map((lod) => ({
    path: ['parts'],
    message: `lod ${String(lod)} estimates ${String(counts[lod])} triangles, target ${String(targets[lod])}`,
  }));
}

function checkedBy(spec: ModelSpec, options: AuthoringOptions): AuthoringReport {
  const triangles = triangleCounts(spec);
  const targets = options.triangleTargets ?? AUTHORING_TRIANGLE_TARGETS;
  return {
    spec,
    triangles,
    problems: [
      ...slotProblems(spec),
      ...specSignalProblems(spec),
      ...(options.capabilitySources === true ? [] : capabilityProblems(spec)),
      ...triangleProblems(triangles, targets),
      ...metreProblems(spec),
    ],
  };
}

export function checkAuthoring(input: unknown, options: AuthoringOptions = {}): AuthoringReport {
  const parsed = MODEL_SPEC.safeParse(input);
  if (!parsed.success) {
    return {
      spec: undefined,
      triangles: NO_TRIANGLES,
      problems: parsed.error.issues.map((issue) => ({
        path: issue.path.filter(
          (segment): segment is string | number => typeof segment !== 'symbol',
        ),
        message: issue.message,
      })),
    };
  }
  return checkedBy(parsed.data, options);
}
