import { useRef, useState } from 'react';
import {
  BOARD_LAYOUT_VERSION,
  arrangementOf,
  withArrangementFor,
  withoutArrangementFor,
  type BoardClass,
  type BoardLayout,
  type BoardWidget,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { LogTally } from '../../../design/log-tally';
import type { HeaderAction, HeaderEditing } from '../../page-header';
import type { BoardDefaults, BoardLayoutState } from '../types';

const log = new Logger('app.widget-board');
const editTally = new LogTally(log, 'edit.changes_summarised', 3000);

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
  readonly opening: string | null;
  readonly header: HeaderEditing | null;
  readonly editAction: HeaderAction;
  readonly begin: (openOptions?: string) => void;
  readonly done: () => void;
  readonly cancel: () => void;
  readonly undo: () => void;
  readonly reset: (board: BoardClass) => void;
  readonly arrangement: (board: BoardClass) => readonly BoardWidget[];
  readonly change: (board: BoardClass, update: ArrangementUpdate, kind: ChangeKind) => void;
  readonly settle: () => void;
}

interface Session {
  readonly opening: string | null;
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
    opening: session.opening,
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
  return {
    opening: session.opening,
    start: session.start,
    draft: previous,
    history: session.history.slice(0, -1),
  };
}

interface Changes {
  readonly change: BoardEditor['change'];
  readonly reset: BoardEditor['reset'];
  readonly undo: BoardEditor['undo'];
  readonly settle: BoardEditor['settle'];
}

function useChanges(
  page: string,
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
      editTally.bump(kind);
      commit((draft) => {
        const widgets = update(arrangementOf(draft, board, defaults));
        return withArrangementFor(draft, board, { widgets: [...widgets] });
      }, push);
    },
    reset: (board): void => {
      log.info('edit.board_reset', { page, board });
      commit((draft) => withoutArrangementFor(draft, board), true);
    },
    undo: (): void => {
      log.debug('edit.undone', { page });
      setSession(undone);
    },
    settle: (): void => {
      gestureRef.current = false;
    },
  };
}

function logSkipped(page: string, reason: string): void {
  log.debug('edit.begin_skipped', { page, reason });
}

function logEnded(event: string, page: string, dirty: boolean, session: Session | null): void {
  log.info(event, { page, dirty, steps: session?.history.length ?? 0 });
}

export function useBoardEditor(input: BoardEditorInput): BoardEditor {
  const { page, layout, defaults, onSave } = input;
  const [session, setSession] = useState<Session | null>(null);
  const changes = useChanges(page, setSession, defaults);
  const current = session?.draft ?? storedOf(layout);
  const dirty = session !== null && !sameLayout(session.start, session.draft);
  const begin = (openOptions?: string): void => {
    if (session === null && layout.status === 'ready') {
      const stored = storedOf(layout);
      log.info('edit.begun', { page, opening: openOptions ?? null });
      setSession({ opening: openOptions ?? null, start: stored, draft: stored, history: [] });
    } else {
      logSkipped(page, session === null ? layout.status : 'already_editing');
    }
  };
  const done = (): void => {
    logEnded('edit.done', page, dirty, session);
    if (dirty) {
      onSave(current);
    }
    setSession(null);
  };
  const cancel = (): void => {
    logEnded('edit.cancelled', page, dirty, session);
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
    opening: session?.opening ?? null,
    header: session === null ? null : { onDone: done, onCancel: cancel, dirty },
    editAction: {
      icon: 'pencil',
      label: 'Edit layout',
      onPress: (): void => {
        begin();
      },
      shortcut: 'E',
    },
    begin,
    done,
    cancel,
    arrangement: (board) => arrangementOf(current, board, defaults),
  };
}
