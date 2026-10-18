import { useLayoutEffect, useRef, useState } from 'react';
import type { BoardClass } from '@smarteverything/domain';
import { notify } from '../../toast-store';
import type { WidgetActions } from '../widget-scope';
import { removed } from './edit-model';
import type { BoardEditor } from './use-board-editor';

export type EditorHandle = Pick<BoardEditor, 'begin' | 'change' | 'undo'>;

export function useEditorHandle(editor: BoardEditor): EditorHandle {
  const latest = useRef(editor);
  useLayoutEffect(() => {
    latest.current = editor;
  });
  const [handle] = useState<EditorHandle>(() => ({
    begin: (openOptions): void => {
      latest.current.begin(openOptions);
    },
    change: (board, update, kind): void => {
      latest.current.change(board, update, kind);
    },
    undo: (): void => {
      latest.current.undo();
    },
  }));
  return handle;
}

export function widgetActions(editor: EditorHandle, board: BoardClass, key: string): WidgetActions {
  return {
    choose: (): void => {
      editor.begin(key);
    },
    remove: (): void => {
      editor.begin();
      editor.change(board, (widgets) => removed(widgets, key), 'step');
      notify({
        message: 'Removed from this page',
        action: { label: 'Undo', onPress: editor.undo },
      });
    },
  };
}
