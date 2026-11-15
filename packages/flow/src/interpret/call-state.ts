import { z } from 'zod';
import type { Frame, RunState } from '../state/run-state';
import { asRecord } from './frames';
import type { Outputs } from './frames';

export const CALL_KEY = '$call';
export const CALL_INPUTS_KEY = '$inputs';
export const CALL_EXIT_KEY = '$exit';

export const CALL_META = z.strictObject({
  key: z.string().min(1),
  node: z.string().min(1),
  function: z.string().min(1),
  revision: z.int().min(1),
  exits: z.array(z.string().min(1)),
  outputs: z.array(z.strictObject({ name: z.string().min(1), optional: z.boolean() })),
});

export type CallMeta = z.infer<typeof CALL_META>;

export function calleeOf(frame: Frame): { readonly id: string; readonly revision: number } | null {
  const meta = CALL_META.safeParse(frame.outputs[CALL_KEY]);
  return meta.success ? { id: meta.data.function, revision: meta.data.revision } : null;
}

export function planOwner(
  state: RunState,
  frame: Frame,
): { readonly id: string; readonly revision: number } | null {
  const own = calleeOf(frame);
  if (own !== null) return own;
  const index = state.frames.findIndex((held) => held.id === frame.id);
  const owner = state.frames.slice(0, index + 1).findLast((held) => held.kind === 'call');
  return owner === undefined ? null : calleeOf(owner);
}

export function instanceOf(state: RunState): string {
  const nodes: string[] = [];
  const functions: string[] = [];
  for (const frame of state.frames) {
    const meta = CALL_META.safeParse(frame.outputs[CALL_KEY]);
    if (!meta.success) continue;
    const seen = functions.indexOf(meta.data.function);
    if (seen !== -1) {
      nodes.length = seen + 1;
      functions.length = seen + 1;
    } else {
      nodes.push(meta.data.node);
      functions.push(meta.data.function);
    }
  }
  return nodes.join('/');
}

export function callInputs(state: RunState): Outputs | undefined {
  const frame = state.frames.findLast((held) => held.kind === 'call');
  return frame === undefined ? undefined : asRecord(frame.outputs[CALL_INPUTS_KEY]);
}
