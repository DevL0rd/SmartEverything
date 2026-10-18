import { useState } from 'react';
import type { BoardClass, BoardWidget } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { heavyThud, selectionTick } from '../../../platform/haptics';
import type { WidgetDefinition } from '../types';
import { useAutoScroll, useDragState, type DragState } from './drag-state';
import { moved, removed, resized, shifted, steppedSize, withOptions } from './edit-model';
import type { WidgetCommand, WidgetHandlers } from './editable-widget';
import type { BoardEditor } from './use-board-editor';
import type { StoredOptions } from './widget-options';

const log = new Logger('app.widget-board');

interface EditUi {
  readonly lifted: string | null;
  readonly resizing: string | null;
  readonly focused: string | null;
  readonly picked: string | null;
  readonly optionsFor: string | null;
  readonly galleryOpen: boolean;
  readonly revealed: string | null;
  readonly frozen: readonly string[] | null;
}

const IDLE_UI: EditUi = {
  lifted: null,
  resizing: null,
  focused: null,
  picked: null,
  optionsFor: null,
  galleryOpen: false,
  revealed: null,
  frozen: null,
};

export interface EditSession {
  readonly ui: EditUi;
  readonly patch: (next: Partial<EditUi>) => void;
  readonly drag: DragState;
  readonly handlers: WidgetHandlers;
  readonly saveOptions: (key: string, options: StoredOptions) => void;
}

export interface EditContext {
  readonly editor: BoardEditor;
  readonly board: BoardClass;
  readonly visible: readonly BoardWidget[];
  readonly definitionOf: (type: string) => WidgetDefinition | undefined;
}

function commandUpdate(
  context: EditContext,
  key: string,
  command: WidgetCommand,
): ((widgets: readonly BoardWidget[]) => readonly BoardWidget[]) | null {
  const keys = context.visible.map((widget) => widget.key);
  if (command === 'remove') {
    return (widgets) => removed(widgets, key);
  }
  if (command === 'earlier' || command === 'later') {
    return (widgets) => shifted(widgets, keys, key, command === 'earlier' ? -1 : 1);
  }
  const widget = context.visible.find((entry) => entry.key === key);
  const definition = widget === undefined ? undefined : context.definitionOf(widget.type);
  if (widget === undefined || definition === undefined) {
    return null;
  }
  const size = steppedSize(definition, context.board, widget.size, command === 'bigger' ? 1 : -1);
  return size === null ? null : (widgets): readonly BoardWidget[] => resized(widgets, key, size);
}

interface HandlerInput {
  readonly context: EditContext;
  readonly touch: boolean;
  readonly patch: (next: Partial<EditUi>) => void;
  readonly settle: () => void;
  readonly autoScroll: (active: boolean) => void;
}

function handlersOf({ context, touch, patch, settle, autoScroll }: HandlerInput): WidgetHandlers {
  const { editor, board } = context;
  return {
    lift: (key): void => {
      log.debug('edit.lifted', { page: editor.page, board, key });
      autoScroll(true);
      if (touch) {
        heavyThud();
      }
      patch({ lifted: key, picked: null, frozen: context.visible.map((widget) => widget.key) });
    },
    drop: (): void => {
      log.debug('edit.dropped', { page: editor.page, board });
      settle();
    },
    resizeStart: (key): void => {
      log.debug('edit.resize_started', { page: editor.page, board, key });
      patch({ resizing: key });
    },
    resizeTo: (key, size): void => {
      editor.change(board, (widgets) => resized(widgets, key, size), 'gesture');
      selectionTick();
    },
    resizeEnd: settle,
    command: (key, command): void => {
      const update = commandUpdate(context, key, command);
      log.debug('edit.command_run', {
        page: editor.page,
        board,
        key,
        command,
        applied: update !== null,
      });
      if (update !== null) {
        editor.change(board, update, 'step');
      }
    },
    openOptions: (key): void => {
      log.debug('edit.options_opened', { page: editor.page, board, key });
      patch({ optionsFor: key });
    },
    focus: (key): void => {
      patch(key === null ? { focused: null, picked: null } : { focused: key });
    },
  };
}

export function useEditSession(context: EditContext, touch: boolean): EditSession {
  const { editor, board } = context;
  const [ui, setUi] = useState<EditUi>({ ...IDLE_UI, optionsFor: editor.opening });
  const patch = (next: Partial<EditUi>): void => {
    setUi((previous) => ({ ...previous, ...next }));
  };
  const drag = useDragState((key: string, target: string | null): void => {
    editor.change(board, (widgets) => moved(widgets, key, target), 'gesture');
    selectionTick();
  });
  const autoScroll = useAutoScroll(drag);
  const settle = (): void => {
    editor.settle();
    autoScroll(false);
    patch({ lifted: null, resizing: null, frozen: null });
  };
  const handlers = handlersOf({ context, touch, patch, settle, autoScroll });
  return {
    ui,
    patch,
    drag,
    handlers,
    saveOptions: (key, options): void => {
      editor.change(board, (widgets) => withOptions(widgets, key, options), 'step');
    },
  };
}
