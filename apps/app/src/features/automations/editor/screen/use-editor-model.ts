import { useAutomationsSource } from '../../data/source';
import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useWindowDimensions } from 'react-native';
import { notify } from '../../../../components/toast-store';
import { usePausable } from '../../../../design/external-store';
import { useIdiom } from '../../../../design/platform';
import { useSizeClass } from '../../../../design/size-class';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { HostActions } from '../host/host-actions';
import { filterPinOf, type InsertPoint, type ScreenPoint } from '../palette/armed-insert';
import { usePaletteEntries } from '../palette/palette';
import { STEP_CONTEXT } from '../palette/palette-search';
import { filterEntriesForPin, pinContext } from '../palette/pin-filter';
import { applyFix } from '../problems/fix-actions';
import { findingById, type LiveCheck } from '../problems/problem-model';
import { useLiveCheck } from '../problems/use-live-check';
import type { EditorKey } from './editor-keys';
import type { InspectorHostProps, PaletteHostProps, ProblemsHostProps } from './editor-panes';
import {
  bottomBarItems,
  editorLayoutOf,
  hasNoSteps,
  inspectorTarget,
  sheetInset,
  type BottomItem,
  type BottomItemId,
  type EditorLayout,
} from './screen-model';
import type { EditorScreenProps } from './screen-types';
import { useSelectionMode, type SelectionMode } from './selection-mode';
import { useEditorKeys } from './use-editor-keys';
import {
  useInsertion,
  usePaneSizes,
  useRefusalNotices,
  useViewportCommand,
  type InsertionControl,
  type PaneControl,
  type ViewportControl,
} from './use-editor-panels';
import { insertStartOf } from './insert-start';
import { useHostActions } from './use-host-actions';
import { useEditorFocus, type EditorFocus } from './use-editor-focus';

export interface EditorModel {
  readonly props: EditorScreenProps;
  readonly layout: EditorLayout;
  readonly touch: boolean;
  readonly check: LiveCheck;
  readonly flags: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly ids: readonly string[];
    readonly empty: boolean;
  };
  readonly insertion: InsertionControl;
  readonly selection: SelectionMode;
  readonly panes: PaneControl;
  readonly viewport: ViewportControl;
  readonly actions: HostActions;
  readonly focus: EditorFocus;
  readonly focusNode: string | null;
  readonly inset: number;
  readonly items: readonly BottomItem[];
  readonly palette: PaletteHostProps;
  readonly problems: ProblemsHostProps;
  readonly inspector: Omit<InspectorHostProps, 'docked'>;
  readonly shortcuts: boolean;
  readonly setShortcuts: Dispatch<SetStateAction<boolean>>;
  readonly onProblems: () => void;
  readonly onBottomItem: (id: BottomItemId) => void;
  readonly openPalette: () => void;
}

function useFlags(store: EditorScreenProps['store']): EditorModel['flags'] {
  const kinds = useAutomationsSource().lookup;
  const canUndo = usePausable(store.state.subscribe, () => store.state.get().canUndo);
  const canRedo = usePausable(store.state.subscribe, () => store.state.get().canRedo);
  const ids = usePausable(store.state.subscribe, () => store.state.get().selection.ids);
  const empty = usePausable(store.state.subscribe, () =>
    hasNoSteps(store.state.get().program, kinds),
  );
  return { canUndo, canRedo, ids, empty };
}

interface ProblemState {
  readonly open: boolean;
  readonly goTo: string | null;
  readonly handlers: Omit<ProblemsHostProps, 'check'>;
  readonly toggle: () => void;
}

function useProblems(
  props: EditorScreenProps,
  check: LiveCheck,
  layout: EditorLayout,
): ProblemState {
  const kinds = useAutomationsSource().lookup;
  const { store } = props;
  const [open, setOpen] = useState(false);
  const [goTo, setGoTo] = useState<string | null>(null);
  const onGoTo = useStableCallback((id: string): void => {
    store.select(id);
    setGoTo(id);
    setOpen(layout === 'wide');
  });
  const onFix = useStableCallback((findingId: string): void => {
    const found = findingById(check, findingId);
    if (found === undefined) return;
    if (applyFix(store.apply, store.state.get().program, found, kinds) === null) {
      notify({ message: 'That problem has no one-tap fix.' });
    }
  });
  const onClose = useCallback((): void => {
    setOpen(false);
  }, []);
  const toggle = useCallback((): void => {
    setOpen((current) => !current);
  }, []);
  return { open, goTo, handlers: { open, onClose, onGoTo, onFix }, toggle };
}

interface Controls {
  readonly onBottomItem: (id: BottomItemId) => void;
  readonly items: readonly BottomItem[];
  readonly shortcuts: boolean;
  readonly setShortcuts: Dispatch<SetStateAction<boolean>>;
}

function useControls(
  props: EditorScreenProps,
  parts: {
    readonly selection: SelectionMode;
    readonly openPalette: () => void;
    readonly flags: EditorModel['flags'];
  },
): Controls {
  const { store } = props;
  const { selection, openPalette, flags } = parts;
  const { empty, canUndo, canRedo } = flags;
  const [shortcuts, setShortcuts] = useState(false);
  const runKey = useStableCallback((key: EditorKey): void => {
    if (key === 'undo') store.undo();
    else if (key === 'redo') store.redo();
    else if (key === 'publish') {
      if (props.online && !empty) props.onPublish();
    } else if (key === 'test') {
      if (!empty) props.onTest();
    } else if (key === 'help') setShortcuts(true);
    else openPalette();
  });
  useEditorKeys(runKey, !shortcuts);
  const onBottomItem = useStableCallback((id: BottomItemId): void => {
    if (id === 'undo') store.undo();
    else if (id === 'redo') store.redo();
    else if (id === 'add') openPalette();
    else if (id === 'select') selection.toggle();
    else if (id === 'test') props.onTest();
    else if (id === 'runs') props.onRuns();
    else props.onInterface();
  });
  const items = useMemo(
    () =>
      bottomBarItems({
        reusable: props.reusable,
        selecting: selection.selecting,
        empty,
        canUndo,
        canRedo,
      }),
    [props.reusable, selection.selecting, empty, canUndo, canRedo],
  );
  return { onBottomItem, items, shortcuts, setShortcuts };
}

function useCanvasChrome(layout: EditorLayout): {
  readonly touch: boolean;
  readonly panes: PaneControl;
  readonly viewport: ViewportControl;
} {
  return {
    touch: useIdiom() === 'touch',
    panes: usePaneSizes(layout),
    viewport: useViewportCommand(),
  };
}

function useInspectorPane(
  props: EditorScreenProps,
  parts: Pick<InspectorHostProps, 'check' | 'target' | 'onFix'>,
): Omit<InspectorHostProps, 'docked'> {
  const { store } = props;
  const onClose = useStableCallback((): void => {
    store.clearSelected();
  });
  return { store, binding: props.inspector, onClose, ...parts };
}

function usePaletteHost(
  store: EditorScreenProps['store'],
  insertion: InsertionControl,
): PaletteHostProps {
  const kinds = useAutomationsSource().lookup;
  const program = usePausable(store.state.subscribe, () => store.state.get().program);
  const pin = filterPinOf(insertion.state);
  const context = useMemo(
    () => (pin === null ? STEP_CONTEXT : pinContext(program, pin, kinds)),
    [program, pin, kinds],
  );
  return { state: insertion.state, context, onChoose: insertion.choose, onClose: insertion.cancel };
}

function useStartPalette(
  store: EditorScreenProps['store'],
  insertion: InsertionControl,
): () => void {
  const kinds = useAutomationsSource().lookup;
  return useStableCallback((): void => {
    const point: InsertPoint = insertStartOf(store.state.get(), kinds);
    insertion.open(point);
  });
}

function useDropInsert(
  insertion: InsertionControl,
): (point: InsertPoint, anchor: ScreenPoint | null) => void {
  const kinds = useAutomationsSource().lookup;
  const entries = usePaletteEntries();
  return useStableCallback((point: InsertPoint, anchor: ScreenPoint | null): void => {
    const fits =
      point.pin === null
        ? []
        : filterEntriesForPin(entries, point.pin, kinds).map((entry) => entry.choice);
    insertion.drop(point, anchor, fits);
  });
}

export function useEditorModel(props: EditorScreenProps): EditorModel {
  const { store } = props;
  const layout = editorLayoutOf(useSizeClass().width);
  const { height } = useWindowDimensions();
  const flags = useFlags(store);
  const check = useLiveCheck(store, props.lint, props.options.registry);
  const insertion = useInsertion(props.onInsert);
  const selection = useSelectionMode(store);
  const problems = useProblems(props, check, layout);
  const openPalette = useStartPalette(store, insertion);
  const controls = useControls(props, { selection, openPalette, flags });
  const { touch, panes, viewport } = useCanvasChrome(layout);
  useRefusalNotices(store);
  const target = inspectorTarget({ ids: flags.ids, selecting: selection.selecting });
  const focus = useEditorFocus(target, () => {
    store.clearSelected();
  });
  const actions = useHostActions({
    store,
    selecting: () => selection.selecting,
    onInsertPoint: useDropInsert(insertion),
    onGroupSelection: props.onGroupSelection,
    onAddTrigger: props.onInterface,
    onOpened: focus.toInspector,
    onEscape: focus.toTopBar,
  });
  const inspector = useInspectorPane(props, { check, target, onFix: problems.handlers.onFix });
  const palette = usePaletteHost(store, insertion);
  return {
    props,
    layout,
    touch,
    check,
    flags,
    insertion,
    selection,
    panes,
    viewport,
    actions,
    focus,
    focusNode: layout === 'phone' ? target : problems.goTo,
    inset: sheetInset(layout, target !== null, height),
    palette,
    problems: { check, ...problems.handlers },
    inspector,
    onProblems: problems.toggle,
    openPalette,
    ...controls,
  };
}
