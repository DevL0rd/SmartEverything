import { useState, useReducer, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'expo-router';
import {
  AUTOMATION_SEQUENCE_DEFINITION,
  identifyActions,
  type AutomationSequenceDefinition,
  type AutomationSequenceRow,
} from '@smarteverything/domain';
import { randomUUID } from 'expo-crypto';
import { saveSequence, removeSequence } from '../../../api/automation-runtime';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt } from '../data/actions';
import { editHistory, type EditHistory, type EditHistoryChange } from '../model/edit-history';
import { useLibraryReturn } from './library-return';
import { useClose, useDiscardPrompt } from './editor-navigation';

interface SequenceDraft {
  readonly name: string;
  readonly definition: AutomationSequenceDefinition;
}
export interface SequenceEditorState extends SequenceDraft {
  readonly saved: AutomationSequenceRow | null;
  readonly busy: boolean;
  readonly dirty: boolean;
  readonly setName: (name: string) => void;
  readonly setDefinition: Dispatch<SetStateAction<AutomationSequenceDefinition>>;
  readonly save: () => void;
  readonly remove: () => void;
  readonly undo: (() => void) | null;
  readonly redo: (() => void) | null;
}
const EMPTY: AutomationSequenceDefinition = {
  actions: [],
  parameters: [],
  origin: null,
  runPolicy: { mode: 'single' },
};
function initialHistory(start: AutomationSequenceRow | null): EditHistory<SequenceDraft> {
  const definition = start?.definition ?? EMPTY;
  return {
    present: {
      name: start?.name ?? '',
      definition: { ...definition, actions: identifyActions(definition.actions, randomUUID) },
    },
    past: [],
    future: [],
  };
}

function useSaveSequence(
  draft: SequenceDraft,
  saved: AutomationSequenceRow | null,
  onSaved: (row: AutomationSequenceRow, draft: SequenceDraft) => void,
): readonly [boolean, () => void] {
  const [busy, setBusy] = useState(false);
  return [
    busy,
    (): void => {
      if (busy) return;
      setBusy(true);
      void attempt('The sequence wasn’t saved', async () => {
        const row = await saveSequence(
          draft.name,
          AUTOMATION_SEQUENCE_DEFINITION.parse(draft.definition),
          saved,
        );
        onSaved(row, draft);
        notify({ message: `${draft.name} saved`, tone: 'positive' });
      }).finally(() => {
        setBusy(false);
      });
    },
  ];
}
function sequenceRemoval(saved: AutomationSequenceRow | null, close: () => void): () => void {
  return (): void => {
    if (saved === null) return;
    void confirm({
      title: `Delete ${saved.name}?`,
      body: 'Sequences used by another program cannot be deleted.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    }).then(async (accepted) => {
      if (accepted && (await attempt('The sequence wasn’t deleted', () => removeSequence(saved))))
        close();
    });
  };
}
function sequenceChanges(
  draft: SequenceDraft,
  change: Dispatch<EditHistoryChange<SequenceDraft>>,
): Pick<SequenceEditorState, 'setName' | 'setDefinition'> {
  const { definition } = draft;
  const setName = (next: string): void => {
    change({ type: 'set', value: { ...draft, name: next } });
  };
  const setDefinition: Dispatch<SetStateAction<AutomationSequenceDefinition>> = (next): void => {
    change({
      type: 'set',
      value: {
        ...draft,
        definition: typeof next === 'function' ? next(definition) : next,
      },
    });
  };
  return { setName, setDefinition };
}

export function useSequenceEditor(start: AutomationSequenceRow | null): SequenceEditorState {
  const router = useRouter();
  const [saved, setSaved] = useState(start);
  const [history, change] = useReducer(
    (state: EditHistory<SequenceDraft>, next: EditHistoryChange<SequenceDraft>) =>
      editHistory(state, next),
    start,
    initialHistory,
  );
  const { name, definition } = history.present;
  const [baseline, setBaseline] = useState(() => JSON.stringify({ name, definition }));
  const [closing, close] = useClose();
  const dirty = JSON.stringify({ name, definition }) !== baseline;
  const destination = useLibraryReturn(dirty);
  const [busy, save] = useSaveSequence({ name, definition }, saved, (row, draft) => {
    setSaved(row);
    setBaseline(JSON.stringify(draft));
    if (destination === null) router.setParams({ sequenceId: row.id });
    else destination.sequenceSaved(row);
  });
  useDiscardPrompt(destination === null && dirty && !closing && !busy);
  return {
    saved,
    name,
    definition,
    busy,
    dirty,
    ...sequenceChanges(history.present, change),
    save,
    remove: sequenceRemoval(saved, destination?.close ?? close),
    undo:
      history.past.length === 0
        ? null
        : (): void => {
            change({ type: 'undo' });
          },
    redo:
      history.future.length === 0
        ? null
        : (): void => {
            change({ type: 'redo' });
          },
  };
}
