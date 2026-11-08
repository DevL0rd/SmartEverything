import type { Engine } from '@smarteverything/domain';
import type { ModelPick } from '../model-choice';

export function pickOf(engine: Engine): ModelPick {
  return { model: engine.model, effort: engine.effort, engine };
}
