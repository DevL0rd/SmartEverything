import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  AI_EFFORT,
  AI_MODEL_CHOICE,
  DEFAULT_AI_EFFORT,
  type EngineKind,
} from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { notify } from '../../../components/toast-store';
import { joinParts } from '../../../format/text';
import { useIsOwner } from '../../../store/selectors';
import { useAssistantStatus } from '../data/assistant-data';
import { useOpenRouterActions } from '../data/openrouter';
import { useResponderActions } from '../data/responder-actions';
import { effortLabel } from '../picker/efforts';
import {
  BACKEND_DEFAULT,
  modelOrNull,
  useWorkerModels,
  type WorkerModels,
} from '../picker/engine-models';
import type { ModelPick } from '../picker/model-choice';
import { useSuggestedModels } from '../picker/model-queries';
import { ModelPickerSheet } from '../picker/model-picker-sheet';

interface DefaultModel {
  readonly pick: ModelPick | null;
  readonly label: string;
  readonly save: (pick: ModelPick) => void;
}

function thinkingLabel(effort: string | null): string | null {
  return effort === null ? null : effortLabel(effort);
}

function useOpenRouterDefault(enabled: boolean): DefaultModel {
  const suggested = useSuggestedModels('chat', null, enabled);
  const actions = useOpenRouterActions();
  const resolved = suggested.data?.default ?? null;
  return {
    pick: resolved === null ? null : { model: resolved.choice, effort: resolved.effort },
    label:
      resolved === null
        ? suggested.isError
          ? 'Couldn’t load'
          : 'Loading…'
        : joinParts([resolved.name, thinkingLabel(resolved.effort)]),
    save: (pick): void => {
      const model = AI_MODEL_CHOICE.safeParse(pick.model);
      const effort = AI_EFFORT.safeParse(pick.effort ?? DEFAULT_AI_EFFORT);
      if (!model.success || !effort.success) {
        notify({ message: 'That model can’t be the default', tone: 'critical' });
        return;
      }
      actions.setDefaults(model.data, effort.data).catch((error: unknown) => {
        notify({ message: 'Default not changed', error, tone: 'critical' });
      });
    },
  };
}

function workerModelName(model: string | null, models: WorkerModels | undefined): string {
  if (models === undefined) {
    return 'Loading…';
  }
  const id = model ?? BACKEND_DEFAULT;
  return models.models.find((entry) => entry.id === id)?.name ?? model ?? 'Default';
}

function useWorkerDefault(backend: EngineKind): DefaultModel {
  const settings = useAssistantStatus()?.settings ?? null;
  const models = useWorkerModels(backend).data;
  const actions = useResponderActions();
  const model = settings === null ? null : settings.new_chat_model;
  const effort = settings === null ? null : settings.new_chat_effort;
  return {
    pick: { model: model ?? BACKEND_DEFAULT, effort },
    label: joinParts([workerModelName(model, models), thinkingLabel(effort)]),
    save: (pick): void => {
      void actions.change(
        { new_chat_model: modelOrNull(pick.model), new_chat_effort: pick.effort },
        'Default model',
      );
    },
  };
}

export function DefaultModelRow({ backend }: { readonly backend: EngineKind }): ReactNode {
  const [open, setOpen] = useState(false);
  const owner = useIsOwner();
  const openrouter = useOpenRouterDefault(backend === 'openrouter');
  const worker = useWorkerDefault(backend);
  const current = backend === 'openrouter' ? openrouter : worker;
  return (
    <>
      <ListRow
        title="Default for new chats"
        subtitle={current.label}
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
        engine={backend}
        picked={current.pick}
        onPick={current.save}
      />
    </>
  );
}
