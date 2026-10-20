import { JSON_VALUE, SIGNAL_INPUT } from '@smarteverything/domain';
import { z } from 'zod';
import { WAIT } from '../state/run-state';
import type { Wait } from '../state/run-state';
import type { Checked, Env, NodeResult } from './frames';

const RESUME = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('due'), recovered: z.boolean() }),
  z.strictObject({ kind: z.literal('signal'), signal: SIGNAL_INPUT }),
  z.strictObject({ kind: z.literal('evaluate') }),
  z.strictObject({ kind: z.literal('timeout') }),
  z.strictObject({
    kind: z.literal('answer'),
    answer: z.string().min(1),
    by: z.string().optional(),
  }),
]);

export type WaitResume = z.infer<typeof RESUME>;

export const RESOLUTION = z.strictObject({ wait: WAIT, resume: RESUME });

export function resumeResult(wait: Wait, resume: WaitResume): NodeResult {
  return { ok: true, value: { wait: JSON_VALUE.parse(wait), resume: JSON_VALUE.parse(resume) } };
}

export type Resolution = z.infer<typeof RESOLUTION>;

export function resolutionOf(
  env: Env,
  op: { readonly at: { readonly key: string } },
  result: NodeResult,
): Checked<Resolution> {
  if (!result.ok) return result;
  const parsed = RESOLUTION.safeParse(result.value);
  if (!parsed.success) {
    return {
      ok: false,
      class: 'Invalid',
      message: `${op.at.key} was resumed with something unreadable`,
    };
  }
  if (parsed.data.wait.nodePath !== env.path) {
    const held = parsed.data.wait.nodePath;
    return {
      ok: false,
      class: 'Invalid',
      message: `${op.at.key} was resumed with the wait of ${held}`,
    };
  }
  return { ok: true, value: parsed.data };
}
