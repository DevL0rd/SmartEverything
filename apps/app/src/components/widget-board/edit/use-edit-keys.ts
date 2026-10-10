import { confirm, pendingConfirm } from '../../confirm-store';
import { warningBuzz } from '../../../platform/haptics';
import type { WidgetCommand } from './editable-widget';
import type { KeyPress } from '../../../design/keyboard';
import { useBackPress, useDocumentKeys } from './keys';
import type { BoardEditor } from './use-board-editor';
import type { EditSession } from './use-edit-handlers';

const MOVES: Readonly<Record<string, WidgetCommand>> = {
  ArrowLeft: 'earlier',
  ArrowUp: 'earlier',
  ArrowRight: 'later',
  ArrowDown: 'later',
};

const RESIZES: Readonly<Record<string, WidgetCommand>> = {
  ArrowLeft: 'smaller',
  ArrowUp: 'smaller',
  ArrowRight: 'bigger',
  ArrowDown: 'bigger',
};

function useLeaveEditing(editor: BoardEditor): () => void {
  return (): void => {
    if (!editor.dirty) {
      editor.cancel();
      return;
    }
    warningBuzz();
    void confirm({
      title: 'Discard layout changes?',
      body: 'Your changes to this page will be lost.',
      confirmLabel: 'Discard',
      tone: 'destructive',
    }).then((discard) => {
      if (discard) {
        editor.cancel();
      }
    });
  };
}

function widgetKey(input: KeyPress, session: EditSession): boolean {
  const { focused, picked } = session.ui;
  if (focused === null) {
    return false;
  }
  if (input.key === ' ') {
    session.patch({ picked: picked === focused ? null : focused });
    return true;
  }
  if (input.key === 'Delete' || input.key === 'Backspace') {
    session.handlers.command(focused, 'remove');
    return true;
  }
  const command = input.shift
    ? RESIZES[input.key]
    : picked === focused
      ? MOVES[input.key]
      : undefined;
  if (command === undefined) {
    return false;
  }
  session.handlers.command(focused, command);
  return true;
}

function boardKey(
  input: KeyPress,
  editor: BoardEditor,
  session: EditSession,
  leave: () => void,
): boolean {
  if (input.command && input.key.toLowerCase() === 'z') {
    editor.undo();
    return true;
  }
  if (input.key === 'Escape') {
    if (session.ui.picked === null) {
      leave();
    } else {
      session.patch({ picked: null });
    }
    return true;
  }
  if (!input.command && !input.alt && input.key.toLowerCase() === 'e') {
    editor.done();
    return true;
  }
  return widgetKey(input, session);
}

export function useEditKeys(active: boolean, editor: BoardEditor, session: EditSession): void {
  const leave = useLeaveEditing(editor);
  const overlay = session.ui.galleryOpen || session.ui.optionsFor !== null;
  const blocked = (): boolean => overlay || pendingConfirm.get() !== null;
  useDocumentKeys(active, (input) => {
    if (input.typing || blocked()) {
      return false;
    }
    return boardKey(input, editor, session, leave);
  });
  useBackPress(active, () => {
    if (blocked()) {
      return false;
    }
    leave();
    return true;
  });
}
