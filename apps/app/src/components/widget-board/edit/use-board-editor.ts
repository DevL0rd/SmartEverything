import { useRef, useState } from 'react';
import {
  BOARD_CLASSES,
  BOARD_LAYOUT_VERSION,
  withArrangementFor,
  type BoardClass,
  type BoardLayout,
  type BoardWidget,
} from '@smarteverything/domain';
import type { HeaderAction, HeaderEditing } from '../../page-header';
import type { BoardDefaults, BoardLayoutState } from '../types';

type ChangeKind = 'step' | 'gesture';

type ArrangementUpdate = (widgets: readonly BoardWidget[]) => readonly BoardWidget[];

export interface BoardEditorInput {
  readonly page: string;
  readonly layout: BoardLayoutState;
  readonly defaults: BoardDefaults;
  readonly onSave: (layout: BoardLayout) => void;
}

export interface BoardEditor {
  readonly page: string;
  readonly layout: BoardLayoutState;
  readonly defaults: BoardDefaults;
  readonly editing: boolean;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly header: HeaderEditing | null;
  readonly editAction: HeaderAction;
  readonly begin: () => void;
  readonly done: () => void;
  readonly cancel: () => void;
  readonly undo: () => void;
  readonly reset: (board: BoardClass) => void;
  readonly arrangement: (board: BoardClass) => readonly BoardWidget[];
  readonly change: (board: BoardClass, update: ArrangementUpdate, kind: ChangeKind) => void;
  readonly settle: () => void;
}

interface Session {
  readonly start: BoardLayout;
  readonly draft: BoardLayout;
  readonly history: readonly BoardLayout[];
}

function storedOf(layout: BoardLayoutState): BoardLayout {
  if (layout.status === 'ready' && layout.layout !== null) {
    return layout.layout;
  }
  return { version: BOARD_LAYOUT_VERSION, classes: {} };
}

function sameLayout(a: BoardLayout, b: BoardLayout): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function withoutClass(layout: BoardLayout, board: BoardClass): BoardLayout {
  const classes: BoardLayout['classes'] = {};
  for (const other of BOARD_CLASSES) {
    const arrangement = layout.classes[other];
    if (other !== board && arrangement !== undefined) {
      classes[other] = arrangement;
    }
  }
  return { version: BOARD_LAYOUT_VERSION, classes };
}

function recorded(
  session: Session | null,
  change: (draft: BoardLayout) => BoardLayout,
  push: boolean,
): Session | null {
  if (session === null) {
    return null;
  }
  const draft = change(session.draft);
  if (sameLayout(draft, session.draft)) {
    return session;
  }
  return {
    start: session.start,
    draft,
    history: push ? [...session.history, session.draft] : session.history,
  };
}

function undone(session: Session | null): Session | null {
  const previous = session?.history.at(-1);
  if (session === null || previous === undefined) {
    return session;
  }
  return { start: session.start, draft: previous, history: session.history.slice(0, -1) };
}

interface Changes {
  readonly change: BoardEditor['change'];
  readonly reset: BoardEditor['reset'];
  readonly undo: BoardEditor['undo'];
  readonly settle: BoardEditor['settle'];
}

function useChanges(
  setSession: (update: (previous: Session | null) => Session | null) => void,
  defaults: BoardDefaults,
): Changes {
  const gestureRef = useRef(false);
  const commit = (update: (draft: BoardLayout) => BoardLayout, push: boolean): void => {
    setSession((previous) => recorded(previous, update, push));
  };
  return {
    change: (board, update, kind): void => {
      const push = kind === 'step' || !gestureRef.current;
      gestureRef.current = kind === 'gesture';
      commit((draft) => {
        const widgets = update(draft.classes[board]?.widgets ?? defaults[board]);
        return withArrangementFor(draft, board, { widgets: [...widgets] });
      }, push);
    },
    reset: (board): void => {
      commit((draft) => withoutClass(draft, board), true);
    },
    undo: (): void => {
      setSession(undone);
    },
    settle: (): void => {
      gestureRef.current = false;
    },
  };
}

export function useBoardEditor(input: BoardEditorInput): BoardEditor {
  const { page, layout, defaults, onSave } = input;
  const [session, setSession] = useState<Session | null>(null);
  const changes = useChanges(setSession, defaults);
  const current = session?.draft ?? storedOf(layout);
  const dirty = session !== null && !sameLayout(session.start, session.draft);
  const begin = (): void => {
    if (session === null && layout.status === 'ready') {
      const stored = storedOf(layout);
      setSession({ start: stored, draft: stored, history: [] });
    }
  };
  const done = (): void => {
    if (dirty) {
      onSave(current);
    }
    setSession(null);
  };
  const cancel = (): void => {
    setSession(null);
  };
  return {
    ...changes,
    page,
    layout,
    defaults,
    editing: session !== null,
    dirty,
    canUndo: (session?.history.length ?? 0) > 0,
    header: session === null ? null : { onDone: done, onCancel: cancel, dirty },
    editAction: { icon: 'pencil', label: 'Edit layout', onPress: begin, shortcut: 'E' },
    begin,
    done,
    cancel,
    arrangement: (board) => current.classes[board]?.widgets ?? defaults[board],
  };
}
