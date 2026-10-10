import type { ReactNode } from 'react';
import { AUTO_LATEST_GEMINI_FLASH, type Engine } from '@smarteverything/domain';
import { modelOrNull } from '../picker/model-label';
import type { ModelPick } from '../picker/model-choice';
import { ModelPicker } from '../picker/model-picker';

function pickOf(engine: Engine): ModelPick {
  return { model: engine.model ?? AUTO_LATEST_GEMINI_FLASH, effort: engine.effort };
}

export function ChatModelPicker({
  engine,
  onChange,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
}): ReactNode {
  return (
    <ModelPicker
      picked={pickOf(engine)}
      onPick={(pick) => {
        onChange({ ...engine, model: modelOrNull(pick.model), effort: pick.effort });
      }}
    />
  );
}
