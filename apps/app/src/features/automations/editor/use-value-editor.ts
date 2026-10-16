import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  validateAutomationValue,
  type AutomationValueContent,
  type AutomationValueRow,
} from '@smarteverything/domain';
import { saveValue, removeValue } from '../../../api/automation-runtime';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { attempt } from '../data/actions';
import { blankValue } from '../model/value-content';
import { useLibraryReturn } from './library-return';
import { useClose, useDiscardPrompt } from './editor-navigation';

export interface ValueEditorState {
  readonly row: AutomationValueRow | null;
  readonly content: AutomationValueContent;
  readonly setContent: Dispatch<SetStateAction<AutomationValueContent>>;
  readonly busy: boolean;
  readonly save: () => void;
  readonly remove: () => void;
}
function valueRemoval(row: AutomationValueRow | null, close: () => void): () => void {
  return (): void => {
    if (row === null) return;
    void confirm({
      title: `Delete ${row.content.name}?`,
      body: 'Values used by an automation cannot be deleted.',
      confirmLabel: 'Delete',
      tone: 'destructive',
    }).then(async (accepted) => {
      if (accepted && (await attempt('The Value wasn’t deleted', () => removeValue(row.id))))
        close();
    });
  };
}
export function useValueEditor(
  start: AutomationValueRow | null,
  initialKind: AutomationValueContent['kind'] = 'boolean',
): ValueEditorState {
  const [row] = useState(start);
  const [baseline] = useState(() => (row === null ? blankValue(initialKind) : row.content));
  const [content, setContent] = useState(baseline);
  const [busy, setBusy] = useState(false);
  const [closing, close] = useClose();
  const dirty = JSON.stringify(content) !== JSON.stringify(baseline);
  const destination = useLibraryReturn(dirty);
  useDiscardPrompt(destination === null && !closing && !busy && dirty);
  const save = (): void => {
    if (busy) return;
    setBusy(true);
    void attempt('The Value wasn’t saved', async () => {
      const saved = await saveValue(validateAutomationValue(content), row);
      notify({ message: `${content.name} saved`, tone: 'positive' });
      if (destination === null) close();
      else destination.valueSaved(saved);
    }).finally(() => {
      setBusy(false);
    });
  };
  return {
    row,
    content,
    setContent,
    busy,
    save,
    remove: valueRemoval(row, destination?.close ?? close),
  };
}
