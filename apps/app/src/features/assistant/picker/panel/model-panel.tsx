import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ContextType,
  type ReactNode,
  type RefObject,
} from 'react';
import { View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { useKeyboard } from '../../../../app-shell/shortcuts';
import { AdaptivePanel, usePanelFrame } from '../../../../components/adaptive-panel';
import { COMPACT_PANEL_INSET } from '../../../../components/compact-panel';
import { SheetBody } from '../../../../components/sheet-body';
import { EscapeScopeVisible } from '../../../../components/use-escape';
import { cn } from '../../../../design/cn';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { DraftEngineChoices } from '../../chats/draft-engine-picker';
import { chooseCoordinator } from '../../data/draft-engine';
import { isComputerEngine } from '../../provider/computer-engine';
import { usePickerSession } from '../model-search-session';
import { ImageSettingsPage } from './image-settings-panel';
import { FolderPage, MachinePage } from './machine-panel';
import { InlinePanelLibrary, libraryPanelSize, type PanelLibraryProps } from './panel-library';
import { MainPage } from './panel-main';
import { PanelSubpageContext } from './panel-subpage';
import { usePlanFirst, type PlanFirst } from './plan-first-row';
import {
  isLibraryPage,
  panelParent,
  useModelPanelState,
  type ModelPanelState,
  type PanelPage,
} from './panel-state';
import { ThinkingPage } from './thinking-panel';
import { STALE_NOTE, usePanelPicker, type PanelPicker } from './use-panel-picker';

export interface ModelPanelProps {
  readonly anchorRef: RefObject<View | null>;
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
  readonly initialPage: PanelPage;
  readonly close: () => void;
  readonly machineInHeader?: boolean;
}

function useCloseOnSessionChange(close: () => void): void {
  const session = usePickerSession();
  const accessory = useEngineAccessory();
  const key = `${session.key}:${accessory?.chat?.id ?? ''}`;
  const [opened] = useState(key);
  useEffect(() => {
    if (opened !== key) close();
  }, [opened, key, close]);
}

function useLibraryShortcut(active: boolean, open: () => void): void {
  useKeyboard((press): boolean => {
    if (!active || !press.command || press.shift || press.alt || press.key.toLowerCase() !== 'l')
      return false;
    open();
    return true;
  }, true);
}

function libraryProps(
  state: ModelPanelState,
  pick: PanelPicker,
  onClose: () => void,
): PanelLibraryProps {
  return {
    image: state.page === 'image-library',
    pick,
    note: state.note ?? pick.reason?.text ?? null,
    onClose,
  };
}

interface PagesProps {
  readonly state: ModelPanelState;
  readonly pick: PanelPicker;
  readonly panel: ModelPanelProps;
  readonly back: () => void;
  readonly cancelMachine: (() => void) | null;
  readonly plan: PlanFirst | null;
}

function goTo(state: ModelPanelState, page: PanelPage): () => void {
  return (): void => {
    state.setPage(page);
  };
}

function MachineChoicePage({ state, panel, back, cancelMachine }: PagesProps): ReactNode {
  return (
    <MachinePage
      engine={panel.engine}
      onBack={panel.initialPage === 'machine' ? null : back}
      backLabel={state.machineParent === 'library' ? 'Back to model library' : undefined}
      onPicked={cancelMachine === null ? back : panel.close}
      onClose={panel.close}
      onFolder={goTo(state, 'folder')}
      focusFolder={state.returnFocus === 'folder'}
    />
  );
}

function PanelPages(props: PagesProps): ReactNode {
  const { state, pick, panel, back, plan } = props;
  const { engine, close } = panel;
  switch (state.page) {
    case 'machine':
      return <MachineChoicePage {...props} />;
    case 'folder':
      return <FolderPage engine={engine} onBack={back} onClose={close} />;
    case 'thinking':
      return (
        <ThinkingPage
          engine={engine}
          blocked={!pick.editable}
          onChange={pick.change}
          onBack={back}
          onClose={close}
        />
      );
    case 'image':
      return <ImageSettingsPage onBack={back} onClose={close} />;
    case 'library':
    case 'image-library':
      return null;
    case 'main':
      return (
        <MainPage
          state={state}
          pick={pick}
          engine={engine}
          onClose={close}
          onLibrary={goTo(state, 'library')}
          onImageLibrary={goTo(state, 'image-library')}
          plan={plan}
          machineInHeader={panel.machineInHeader === true}
        />
      );
  }
}

type VisiblePagesProps = PagesProps & { readonly localTitle: string | null };

function RetainedLibrary({ state, pick, panel, back, localTitle }: VisiblePagesProps): ReactNode {
  const visible = isLibraryPage(state.page);
  return (
    <EscapeScopeVisible value={visible}>
      <View
        aria-hidden={!visible}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
        className={visible ? 'min-h-0 shrink' : 'hidden'}
      >
        <InlinePanelLibrary
          {...libraryProps(state, pick, panel.close)}
          onBack={back}
          visible={visible}
          restoreMachineFocus={state.returnFocus === 'machine'}
          localTitle={localTitle}
        />
      </View>
    </EscapeScopeVisible>
  );
}

function useDraftMachine(props: PagesProps): ReactNode {
  const { state, panel, back } = props;
  const draft = useEngineAccessory()?.host.draft === true;
  if (
    state.page !== 'machine' ||
    state.machineParent !== 'main' ||
    !draft ||
    !isComputerEngine(panel.engine)
  )
    return null;
  return (
    <DraftEngineChoices
      engine={panel.engine}
      onChange={panel.onChange}
      onCoordinator={chooseCoordinator}
      runtime={null}
      close={panel.close}
      onBack={back}
    />
  );
}

function VisiblePages(props: VisiblePagesProps): ReactNode {
  const { state } = props;
  const library = isLibraryPage(state.page);
  const retained =
    state.machineParent === 'library' && (state.page === 'machine' || state.page === 'folder');
  const sheet = usePanelFrame().presentation === 'sheet';
  const scroll = state.page !== 'folder';
  const padding = sheet || !scroll ? '' : cn(COMPACT_PANEL_INSET, 'py-1');
  const draft = useDraftMachine(props);
  if (draft !== null) return draft;
  return (
    <>
      {library || retained ? <RetainedLibrary {...props} /> : null}
      {library ? null : (
        <SheetBody scroll={scroll} fit padding={padding}>
          <PanelPages {...props} />
        </SheetBody>
      )}
    </>
  );
}

function usePicker(
  props: ModelPanelProps,
  state: ModelPanelState,
  onMachine: () => void,
): PanelPicker {
  return usePanelPicker({
    engine: props.engine,
    onChange: props.onChange,
    blocked: props.blocked,
    close: props.close,
    onStale: (): void => {
      state.setNote(STALE_NOTE);
    },
    onMachine,
  });
}

function usePanelBack(
  props: ModelPanelProps,
  state: ModelPanelState,
  localBack: RefObject<(() => void) | null>,
): {
  readonly close: () => void;
  readonly back: () => void;
  readonly openMachine: () => void;
  readonly cancelMachine: (() => void) | null;
} {
  const opener = useRef<HTMLElement | null>(null);
  const accessory = useEngineAccessory();
  const cancelMachine = accessory !== null && accessory.pending !== null ? accessory.cancel : null;
  const close = (): void => {
    cancelMachine?.();
    props.close();
  };
  const parent = panelParent(props.initialPage, state);
  const back = (): void => {
    if (localBack.current !== null) {
      localBack.current();
      return;
    }
    if (parent === null) {
      close();
      return;
    }
    if (state.page === 'machine') cancelMachine?.();
    state.setPage(parent);
    const target = parent === 'library' ? opener.current : null;
    if (target !== null) {
      opener.current = null;
      requestAnimationFrame(() => {
        if (target.isConnected) target.focus();
      });
    }
  };
  return {
    close,
    back,
    cancelMachine,
    openMachine: (): void => {
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement)
        opener.current = document.activeElement;
      state.setPage('machine');
    },
  };
}

const PAGE_TITLES: Readonly<Record<PanelPage, string>> = {
  main: 'Models and thinking',
  machine: 'Runs on',
  thinking: 'Thinking',
  image: 'Image settings',
  library: 'Model library',
  'image-library': 'Image model library',
  folder: 'Choose folder',
};

function useSubpageNavigation(): {
  readonly localBack: RefObject<(() => void) | null>;
  readonly localTitle: string | null;
  readonly subpage: NonNullable<ContextType<typeof PanelSubpageContext>>;
} {
  const localBack = useRef<(() => void) | null>(null);
  const [localTitle, setTitle] = useState<string | null>(null);
  const subpage = useMemo(
    () => ({
      setTitle,
      registerBack: (back: () => void): (() => void) => {
        localBack.current = back;
        return (): void => {
          if (localBack.current === back) localBack.current = null;
        };
      },
    }),
    [],
  );
  return { localBack, localTitle, subpage };
}

export function ModelPanel(props: ModelPanelProps): ReactNode {
  const state = useModelPanelState(props.initialPage);
  const plan = usePlanFirst();
  const library = isLibraryPage(state.page);
  const header = props.initialPage === 'machine' && props.machineInHeader === true;
  const { localBack, localTitle, subpage } = useSubpageNavigation();
  const { close, back, openMachine, cancelMachine } = usePanelBack(props, state, localBack);
  useCloseOnSessionChange(close);
  useLibraryShortcut(state.page === 'main', goTo(state, 'library'));
  const pick = usePicker({ ...props, close }, state, openMachine);
  return (
    <AdaptivePanel
      anchorRef={props.anchorRef}
      open
      fit
      chrome
      scroll={false}
      onClose={close}
      onBack={back}
      pointerPlacement={library ? 'center' : header ? 'below' : 'above'}
      {...(library ? { pointerSize: libraryPanelSize(state.page === 'image-library') } : {})}
      label={localTitle ?? PAGE_TITLES[state.page]}
    >
      <PanelSubpageContext value={subpage}>
        <VisiblePages
          state={state}
          pick={pick}
          panel={{ ...props, close }}
          back={back}
          cancelMachine={cancelMachine}
          localTitle={localTitle}
          plan={plan}
        />
      </PanelSubpageContext>
    </AdaptivePanel>
  );
}
