import { join } from 'node:path';
import { z } from 'zod';

export const LOCK_KINDS = ['gradle', 'tsc', 'vitest', 'chromium'] as const;

export type LockKind = (typeof LOCK_KINDS)[number];

export const LOCK_SLOTS: Readonly<Record<LockKind, number>> = {
  gradle: 1,
  tsc: 2,
  vitest: 4,
  chromium: 4,
};

export const LOCK_SCRIPT = 'tmp/lockrun.sh';

const STEP = z.object({
  name: z.string().min(1),
  program: z.string().min(1),
  args: z.array(z.string()),
  cwd: z.string().min(1),
  kind: z.enum(LOCK_KINDS).nullable(),
});

export const STEPS_REQUEST = z.object({
  tag: z.string().min(1),
  environment: z.record(z.string(), z.string()),
  steps: z.array(STEP),
});

export type StepRequest = z.infer<typeof STEPS_REQUEST>;

export const STEP_EVENT = z.union([
  z.strictObject({ started: z.string().min(1) }),
  z.strictObject({ failed: z.string().min(1) }),
  z.strictObject({ finished: z.boolean() }),
]);

export type StepEvent = z.infer<typeof STEP_EVENT>;

export interface StepSpec {
  readonly name: string;
  readonly program: string;
  readonly args: readonly string[];
  readonly kind: LockKind | null;
}

export function lockedStep(workspace: string, spec: StepSpec): StepSpec {
  const lock = join(workspace, LOCK_SCRIPT);
  return spec.kind === null
    ? spec
    : {
        ...spec,
        program: lock,
        args: [spec.kind, String(LOCK_SLOTS[spec.kind]), spec.program, ...spec.args],
      };
}

export function stepsRequest(
  workspace: string,
  tag: string,
  steps: readonly StepSpec[],
): StepRequest {
  return {
    tag,
    environment: {},
    steps: steps.map((spec) => ({
      ...lockedStep(workspace, spec),
      args: [...spec.args],
      cwd: workspace,
    })),
  };
}

export function eventLine(event: StepEvent): string {
  return `${JSON.stringify(event)}\n`;
}
