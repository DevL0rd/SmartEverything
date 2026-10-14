import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  DEFAULT_ENGINE,
  AUTO_LATEST_GEMINI_FLASH,
  AI_MODEL_CHOICE,
  AI_EFFORT,
  DEFAULT_AI_EFFORT,
  type Engine,
} from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { notify } from '../../../components/toast-store';
import { useIsOwner } from '../../../store/selectors';
import { useModelLabel, modelOrNull } from '../picker/model-label';
import { ModelPickerSheet } from '../picker/model-picker-sheet';
import { useSuggestedModels } from '../picker/model-queries';
import { useOpenRouterActions } from '../data/openrouter';
import {
  useComputerProviderSupported,
  useEngineCatalogue,
  useEngineDefaultChange,
} from '../provider/provider-data';

function useDefaultEngine(): { readonly engine: Engine; readonly save: (engine: Engine) => void } {
  const supported = useComputerProviderSupported();
  const catalogue = useEngineCatalogue();
  const legacy = useSuggestedModels('chat', null, true);
  const actions = useOpenRouterActions();
  const change = useEngineDefaultChange();
  const resolved = legacy.data?.default;
  const legacyEngine: Engine =
    resolved === undefined || resolved === null
      ? DEFAULT_ENGINE
      : { kind: 'openrouter', model: modelOrNull(resolved.choice), effort: resolved.effort };
  return {
    engine: catalogue.data?.default ?? legacyEngine,
    save: (engine): void => {
      if (supported) {
        change.mutate(engine);
        return;
      }
      if (engine.kind !== 'openrouter') {
        notify({ message: 'Update this hub to use computer-supplied models', tone: 'critical' });
        return;
      }
      const model = AI_MODEL_CHOICE.parse(engine.model ?? AUTO_LATEST_GEMINI_FLASH);
      const effort = AI_EFFORT.parse(engine.effort ?? DEFAULT_AI_EFFORT);
      void actions.setDefaults(model, effort).catch((error: unknown) => {
        notify({ message: 'Default not changed', error, tone: 'critical' });
      });
    },
  };
}

export function DefaultModelRow(): ReactNode {
  const [open, setOpen] = useState(false);
  const owner = useIsOwner();
  const current = useDefaultEngine();
  const engine = current.engine;
  const label = useModelLabel(engine);
  return (
    <>
      <ListRow
        title="Default for new chats"
        subtitle={`${label.name}${label.computer === null ? '' : ` · ${label.computer}`}`}
        icon="star"
        chevron
        disabled={!owner}
        onPress={() => {
          setOpen(true);
        }}
      />
      <ModelPickerSheet
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Default for new chats"
        picked={{ model: engine.model ?? AUTO_LATEST_GEMINI_FLASH, effort: engine.effort, engine }}
        onPick={(pick) => {
          current.save(
            pick.engine ?? {
              kind: 'openrouter',
              model: modelOrNull(pick.model),
              effort: pick.effort,
            },
          );
        }}
      />
    </>
  );
}
