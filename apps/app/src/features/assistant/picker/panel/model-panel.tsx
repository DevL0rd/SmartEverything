import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { View } from 'react-native';
import type { Engine } from '@smarteverything/domain';
import { useKeyboard } from '../../../../app-shell/shortcuts';
import { AdaptivePanel, usePanelFrame } from '../../../../components/adaptive-panel';
import { useEscape } from '../../../../components/use-escape';
import { cn } from '../../../../design/cn';
import { useEngineAccessory } from '../../chats/engine-accessories';
import { usePickerSession } from '../model-search-session';
import { MachinePage } from './machine-panel';
import { MainPage } from './panel-main';
import { useModelPanelState, type ModelPanelState, type PanelPage } from './panel-state';
import { ThinkingPage } from './thinking-panel';
import { STALE_NOTE, usePanelPicker, type PanelPicker } from './use-panel-picker';

export interface ModelPanelProps {
  readonly anchorRef: RefObject<View | null>;
  readonly engine: Engine;
  readonly onChange: (engine: Engine) => void;
  readonly blocked: boolean;
  readonly initialPage: PanelPage;
  readonly close: () => void;
  readonly onLibrary: (query: string) => void;
  readonly onImageLibrary: () => void;
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

function useLibraryShortcut(onLibrary: (query: string) => void): void {
  useKeyboard((press): boolean => {
    if (!press.command || press.shift || press.alt || press.key.toLowerCase() !== 'l') return false;
    onLibrary('');
    return true;
  }, true);
}

function PanelRoot({ children }: { readonly children: ReactNode }): ReactNode {
  const sheet = usePanelFrame().presentation === 'sheet';
  return <View className={cn(sheet ? '-mx-4' : 'min-h-0 flex-1')}>{children}</View>;
}

function PanelPages({
  state,
  pick,
  panel,
}: {
  readonly state: ModelPanelState;
  readonly pick: PanelPicker;
  readonly panel: ModelPanelProps;
}): ReactNode {
  const { engine, close } = panel;
  const back = (): void => {
    state.setPage('main');
  };
  useEscape(state.page !== 'main', back);
  switch (state.page) {
    case 'machine':
      return <MachinePage engine={engine} onBack={back} onClose={close} />;
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
    case 'main':
      return (
        <MainPage
          state={state}
          pick={pick}
          engine={engine}
          onClose={close}
          onLibrary={panel.onLibrary}
          onImageLibrary={panel.onImageLibrary}
        />
      );
  }
}

export function ModelPanel(props: ModelPanelProps): ReactNode {
  const { engine, onChange, blocked, close } = props;
  const state = useModelPanelState(props.initialPage);
  useCloseOnSessionChange(close);
  useLibraryShortcut(props.onLibrary);
  const pick = usePanelPicker({
    engine,
    onChange,
    blocked,
    close,
    onStale: (): void => {
      state.setNote(STALE_NOTE);
    },
  });
  return (
    <AdaptivePanel anchorRef={props.anchorRef} open fit onClose={close} label="Models and thinking">
      <PanelRoot>
        <PanelPages state={state} pick={pick} panel={props} />
      </PanelRoot>
    </AdaptivePanel>
  );
}
