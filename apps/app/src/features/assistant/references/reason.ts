import type { Engine } from '@smarteverything/domain';
import type { BindingProblem } from '../commands/dsh-binding';
import { COMPUTER_ENGINE_LABELS } from '../provider/computer-engine';

export interface SearchReason {
  readonly kind: 'offline' | 'unsupported' | 'other';
  readonly text: string;
}

const BINDING_COPY: Readonly<Record<BindingProblem, SearchReason>> = {
  offline: { kind: 'offline', text: 'Reconnecting. References come back when connected.' },
  preparing: { kind: 'other', text: 'Finding references…' },
  'machine-offline': { kind: 'other', text: 'Reconnect the selected machine to use references.' },
  'machine-outdated': { kind: 'other', text: 'Update the selected machine to use references.' },
  'not-ready': { kind: 'other', text: 'References aren’t ready yet. Try again in a moment.' },
  failed: { kind: 'other', text: 'Couldn’t load references.' },
};

export function searchReason(
  kind: Engine['kind'] | undefined,
  ready: boolean,
  problem: BindingProblem | null,
): SearchReason | null {
  if (!ready) return BINDING_COPY.offline;
  if (kind === undefined) return { kind: 'other', text: 'Preparing this chat…' };
  if (kind === 'claude') return null;
  if (kind !== 'dsh' && kind !== 'openrouter') {
    return {
      kind: 'unsupported',
      text: `${COMPUTER_ENGINE_LABELS[kind].name} can’t use references.`,
    };
  }
  return problem === null ? null : BINDING_COPY[problem];
}
