import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  AUTO_LATEST_GEMINI_FLASH,
  ENGINE_KINDS,
  ENGINE_LABELS,
  type Engine,
} from '@smarteverything/domain';
import { Segmented } from '../../../components/segmented';
import type { ModelPick } from '../picker/model-choice';
import { BACKEND_DEFAULT, modelOrNull } from '../picker/engine-models';
import { ModelPicker } from '../picker/model-picker';

function pickOf(engine: Engine): ModelPick {
  const fallback = engine.kind === 'openrouter' ? AUTO_LATEST_GEMINI_FLASH : BACKEND_DEFAULT;
  return { model: engine.model ?? fallback, effort: engine.effort };
}

export function EnginePicker({
  engine,
  onChange,
}: {
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
}): ReactNode {
  return (
    <View className="min-h-0 flex-1 gap-3">
      <Segmented
        label="AI backend"
        value={engine.kind}
        options={ENGINE_KINDS.map((kind) => ({ value: kind, label: ENGINE_LABELS[kind] }))}
        onChange={(kind) => {
          onChange({ kind, model: null, effort: null, worker_id: null });
        }}
      />
      <ModelPicker
        key={engine.kind}
        engine={engine.kind}
        picked={pickOf(engine)}
        onPick={(pick) => {
          onChange({ ...engine, model: modelOrNull(pick.model), effort: pick.effort });
        }}
      />
    </View>
  );
}
