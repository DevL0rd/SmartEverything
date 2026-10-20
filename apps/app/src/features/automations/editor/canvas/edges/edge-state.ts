import type { RunNode } from '../../../model/canvas/contract';

export type WireState = 'idle' | 'taken' | 'flowing' | 'skipped';

export function wireState(source: RunNode | null, target: RunNode | null): WireState {
  if (source === null) return 'idle';
  if (source.state === 'skipped') return 'skipped';
  if (source.state !== 'done' && source.state !== 'failed') return 'idle';
  if (target === null || target.state === 'skipped') return 'idle';
  return target.state === 'running' ? 'flowing' : 'taken';
}
