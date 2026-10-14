import type { ReactNode } from 'react';
import { AUTO_LATEST_GEMINI_FLASH, type Engine } from '@smarteverything/domain';
import { modelOrNull } from '../picker/model-label';
import type { ModelPick } from '../picker/model-choice';
import type { NativeModelRequest } from '../provider/subscription-models';
import { ModelPicker } from '../picker/model-picker';

function pickOf(engine: Engine): ModelPick {
  return { model: engine.model ?? AUTO_LATEST_GEMINI_FLASH, effort: engine.effort, engine };
}

export function ChatModelPicker({
  engine,
  onChange,
  onNativeNeeded,
  initialQuery,
}: {
  readonly onNativeNeeded?: ((request: NativeModelRequest) => void) | undefined;
  readonly initialQuery?: string;
  readonly engine: Engine;
  readonly onChange: ((engine: Engine) => void) | null;
}): ReactNode {
  return (
    <ModelPicker
      picked={pickOf(engine)}
      {...(initialQuery === undefined ? {} : { initialQuery })}
      onNativeNeeded={onNativeNeeded}
      onPick={
        onChange === null
          ? null
          : (pick): void => {
              onChange(
                pick.engine ?? {
                  kind: 'openrouter',
                  model: modelOrNull(pick.model),
                  effort: pick.effort,
                },
              );
            }
      }
    />
  );
}
