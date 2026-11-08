import { NODE_REGISTRY, runModeOf, type ActionMode } from '@smarteverything/domain';
import type { EffectRequest } from '@smarteverything/flow/interpret/frames';

export function modeOf(request: Pick<EffectRequest, 'kind' | 'mode'>): ActionMode {
  return runModeOf(NODE_REGISTRY.get(request.kind), request.mode);
}
