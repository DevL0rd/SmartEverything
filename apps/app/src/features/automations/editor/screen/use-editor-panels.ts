import { useCallback, useEffect, useState } from 'react';
import { notify } from '../../../../components/toast-store';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { InsertPoint, ViewportCommand } from '../../model/canvas/contract';
import type { DocumentStore } from '../../model/editor/document-store';
import {
  CLOSED,
  cancel,
  choose as chooseEntry,
  openPalette,
  placeAt,
  type InsertState,
  type InsertStep,
  type Insertion,
} from '../palette/armed-insert';
import type { PaletteChoice } from '../palette/palette-categories';
import { PANE_DEFAULTS, type EditorLayout, type PaneSizes } from './screen-model';

export interface InsertionControl {
  readonly state: InsertState;
  readonly open: (point: InsertPoint | null) => void;
  readonly choose: (choice: PaletteChoice) => void;
  readonly cancel: () => void;
}

export function useInsertion(onInsert: (insertion: Insertion) => void): InsertionControl {
  const [state, setState] = useState<InsertState>(CLOSED);
  const run = useStableCallback((step: InsertStep): void => {
    setState(step.state);
    if (step.insertion !== null) onInsert(step.insertion);
  });
  const open = useStableCallback((point: InsertPoint | null): void => {
    run(state.phase === 'placing' && point !== null ? placeAt(state, point) : openPalette(point));
  });
  const choose = useStableCallback((choice: PaletteChoice): void => {
    run(chooseEntry(state, choice));
  });
  const close = useStableCallback((): void => {
    run(cancel(state));
  });
  return { state, open, choose, cancel: close };
}

export interface PaneControl {
  readonly sizes: PaneSizes;
  readonly resize: (pane: keyof PaneSizes, width: number) => void;
}

export function usePaneSizes(layout: EditorLayout): PaneControl {
  const [sizes, setSizes] = useState<Readonly<Record<EditorLayout, PaneSizes>>>(PANE_DEFAULTS);
  const resize = useCallback(
    (pane: keyof PaneSizes, width: number): void => {
      setSizes((current) => ({ ...current, [layout]: { ...current[layout], [pane]: width } }));
    },
    [layout],
  );
  return { sizes: sizes[layout], resize };
}

export interface ViewportControl {
  readonly command: ViewportCommand | null;
  readonly issue: (type: ViewportCommand['type']) => void;
}

export function useViewportCommand(): ViewportControl {
  const [command, setCommand] = useState<ViewportCommand | null>(null);
  const issue = useCallback((type: ViewportCommand['type']): void => {
    setCommand((current) => ({ type, seq: (current?.seq ?? 0) + 1 }));
  }, []);
  return { command, issue };
}

export function useRefusalNotices(store: DocumentStore): void {
  useEffect(
    () =>
      store.state.subscribe(() => {
        const { refusal } = store.state.get();
        if (refusal === null) return;
        notify({ message: refusal.reason });
        store.clearRefusal();
      }),
    [store],
  );
}
