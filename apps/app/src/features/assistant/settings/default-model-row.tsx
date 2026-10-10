import type { ReactNode } from 'react';
import { useState } from 'react';
import { AI_EFFORT, AI_MODEL_CHOICE, DEFAULT_AI_EFFORT } from '@smarteverything/domain';
import { ListRow } from '../../../components/list-row';
import { notify } from '../../../components/toast-store';
import { joinParts } from '../../../format/text';
import { useIsOwner } from '../../../store/selectors';
import { useOpenRouterActions } from '../data/openrouter';
import { effortLabel } from '../picker/efforts';
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

function unresolvedLabel(
  pending: boolean,
  failed: boolean,
  syncError: string | null | undefined,
): string {
  if (pending) {
    return 'Loading…';
  }
  if (failed || (syncError !== null && syncError !== undefined)) {
    return 'Couldn’t load the model list';
  }
  return 'Not set';
}

function useOpenRouterDefault(): DefaultModel {
  const suggested = useSuggestedModels('chat', null, true);
  const actions = useOpenRouterActions();
  const resolved = suggested.data?.default ?? null;
  return {
    pick: resolved === null ? null : { model: resolved.choice, effort: resolved.effort },
    label:
      resolved === null
        ? unresolvedLabel(suggested.isPending, suggested.isError, suggested.data?.sync_error)
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

export function DefaultModelRow(): ReactNode {
  const [open, setOpen] = useState(false);
  const owner = useIsOwner();
  const current = useOpenRouterDefault();
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
        picked={current.pick}
        onPick={current.save}
      />
    </>
  );
}
