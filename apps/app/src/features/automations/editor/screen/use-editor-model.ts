import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { notify } from '../../../../components/toast-store';
import { usePausable } from '../../../../design/external-store';
import { useIdiom } from '../../../../design/platform';
import { useSizeClass } from '../../../../design/size-class';
import { useStableCallback } from '../../../../design/use-stable-callback';
import type { HostActions } from '../host/intent-env';
import type { SceneOptions } from '../host/use-canvas-props';
import { applyFix } from '../problems/fix-actions';
import { findingById, type LiveCheck } from '../problems/problem-model';
import { useLiveCheck } from '../problems/use-live-check';
import type { EditorKey } from './editor-keys';
import type { InspectorHostProps, PaletteHostProps, ProblemsHostProps } from './editor-panes';
import {
  bottomBarItems,
  editorLayoutOf,
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
import { useHostActions, windowWidth } from './use-host-actions';

export interface EditorModel {
  readonly props: EditorScreenProps;
  readonly layout: EditorLayout;
  readonly touch: boolean;
  readonly check: LiveCheck;
  readonly options: SceneOptions;
  readonly flags: {
    readonly canUndo: boolean;
    readonly canRedo: boolean;
    readonly ids: readonly string[];
  };
  readonly insertion: InsertionControl;
  readonly selection: SelectionMode;
  readonly panes: PaneControl;
  readonly viewport: ViewportControl;
  readonly actions: HostActions;
  readonly focusNode: string | null;
  readonly inset: number;
  readonly items: readonly BottomItem[];
  readonly palette: PaletteHostProps;
  readonly problems: ProblemsHostProps;
  readonly inspector: Omit<InspectorHostProps, 'docked'>;
  readonly shortcuts: boolean;
  readonly setShortcuts: Dispatch<SetStateAction<boolean>>;
  readonly onBodyLayout: (event: LayoutChangeEvent) => void;
  readonly onProblems: () => void;
  readonly onBottomItem: (id: BottomItemId) => void;
}

function useFlags(store: EditorScreenProps['store']): EditorModel['flags'] {
  const canUndo = usePausable(store.state.subscribe, () => store.state.get().canUndo);
  const canRedo = usePausable(store.state.subscribe, () => store.state.get().canRedo);
  const ids = usePausable(store.state.subscribe, () => store.state.get().selection.ids);
  return { canUndo, canRedo, ids };
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
    if (applyFix(store.apply, store.state.get().program, found) === null) {
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
  parts: { readonly selection: SelectionMode; readonly insertion: InsertionControl },
): Controls {
  const { store } = props;
  const { selection, insertion } = parts;
  const [shortcuts, setShortcuts] = useState(false);
  const runKey = useStableCallback((key: EditorKey): void => {
    if (key === 'undo') store.undo();
    else if (key === 'redo') store.redo();
    else if (key === 'publish') {
      if (props.online) props.onPublish();
    } else if (key === 'test') props.onTest();
    else if (key === 'help') setShortcuts(true);
    else insertion.open(null);
  });
  useEditorKeys(runKey, !shortcuts);
  const onBottomItem = useStableCallback((id: BottomItemId): void => {
    if (id === 'add') insertion.open(null);
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
      }),
    [props.reusable, selection.selecting],
  );
  return { onBottomItem, items, shortcuts, setShortcuts };
}

function useCanvasWidth(): {
  readonly width: () => number;
  readonly onBodyLayout: (event: LayoutChangeEvent) => void;
} {
  const width = useRef(windowWidth());
  const onBodyLayout = useCallback((event: LayoutChangeEvent): void => {
    width.current = event.nativeEvent.layout.width;
  }, []);
  return { width: () => width.current, onBodyLayout };
}

function useSceneOptions(props: EditorScreenProps): {
  readonly check: LiveCheck;
  readonly options: SceneOptions;
} {
  const check = useLiveCheck(props.store, props.lint, props.options.registry);
  const options = useMemo<SceneOptions>(
    () => ({ ...props.options, problems: check.scene }),
    [props.options, check.scene],
  );
  return { check, options };
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

export function useEditorModel(props: EditorScreenProps): EditorModel {
  const { store } = props;
  const layout = editorLayoutOf(useSizeClass().width);
  const { height } = useWindowDimensions();
  const flags = useFlags(store);
  const { check, options } = useSceneOptions(props);
  const insertion = useInsertion(props.onInsert);
  const selection = useSelectionMode(store);
  const problems = useProblems(props, check, layout);
  const controls = useControls(props, { selection, insertion });
  const canvas = useCanvasWidth();
  const { touch, panes, viewport } = useCanvasChrome(layout);
  useRefusalNotices(store);
  const target = inspectorTarget({ ids: flags.ids, selecting: selection.selecting });
  const actions = useHostActions({
    store,
    options,
    canvasWidth: canvas.width,
    selecting: () => selection.selecting,
    onInsertPoint: insertion.open,
    onGroupSelection: props.onGroupSelection,
    onHeader: props.onRename,
  });
  const inspector = useInspectorPane(props, { check, target, onFix: problems.handlers.onFix });
  return {
    props,
    layout,
    touch,
    check,
    options,
    flags,
    insertion,
    selection,
    panes,
    viewport,
    actions,
    focusNode: layout === 'phone' ? target : problems.goTo,
    inset: sheetInset(layout, target !== null, height),
    palette: { state: insertion.state, onChoose: insertion.choose, onClose: insertion.cancel },
    problems: { check, ...problems.handlers },
    inspector,
    onBodyLayout: canvas.onBodyLayout,
    onProblems: problems.toggle,
    ...controls,
  };
}
