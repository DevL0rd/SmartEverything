import type { Completion } from '../state/run-state';
import type { Env } from './frames';
import { deriveEnv, ownsScope, popFrame, traceNode } from './frames';

export function traceOwnerEnd(env: Env, completion: Completion): void {
  if (completion.kind !== 'error' && completion.kind !== 'cancelled') return;
  const owner = deriveEnv(env, popFrame(env.state));
  if (!ownsScope(owner.op)) return;
  if (completion.kind === 'error') traceNode(owner, 'failed', completion.error);
  else traceNode(owner, 'cancelled');
}
