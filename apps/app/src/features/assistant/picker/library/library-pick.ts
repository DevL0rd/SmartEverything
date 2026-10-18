import { AUTO_LATEST_GEMINI_FLASH, type Engine } from '@smarteverything/domain';
import type { ModelPick } from '../model-choice';
import { modelOrNull } from '../model-label';

export function pickOf(engine: Engine): ModelPick {
  return { model: engine.model ?? AUTO_LATEST_GEMINI_FLASH, effort: engine.effort, engine };
}

export function engineOf(pick: ModelPick): Engine {
  return pick.engine ?? { kind: 'openrouter', model: modelOrNull(pick.model), effort: pick.effort };
}
