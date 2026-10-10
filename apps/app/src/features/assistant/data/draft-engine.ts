import { DEFAULT_ENGINE, type Engine } from '@smarteverything/domain';
import { ValueStore, useValue } from '../../../design/external-store';

const engine = new ValueStore<Engine>(DEFAULT_ENGINE);

export function useDraftEngine(): readonly [Engine, (next: Engine) => void] {
  return [useValue(engine), engine.set];
}

export function resetDraftEngine(): void {
  engine.set(DEFAULT_ENGINE);
}
