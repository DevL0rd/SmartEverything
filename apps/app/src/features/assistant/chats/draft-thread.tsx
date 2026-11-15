import type { ReactNode } from 'react';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import { useDraftEngine } from '../data/draft-engine';
import { DraftShell } from './chat-header';
import { useDraftKeys } from './chat-list-toggle';
import { EngineAccessoryProvider, useEngineControls } from './engine-accessories';
import { StartChat } from './start-chat';

export const NEW_CHAT_ID = 'new';

function HiddenNavigation(): ReactNode {
  useHideNavigation();
  return null;
}

export function DraftThread({
  onStarted,
  back,
  leading = [],
}: {
  readonly onStarted: (chatId: string) => void;
  readonly back: boolean;
  readonly leading?: readonly ShellAction[];
}): ReactNode {
  const [engine, setEngine] = useDraftEngine();
  const control = useEngineControls(engine, setEngine);
  useDraftKeys();
  return (
    <EngineAccessoryProvider value={control}>
      {back ? <HiddenNavigation /> : null}
      <DraftShell engine={engine} back={back} leading={leading}>
        <StartChat onStarted={onStarted} />
      </DraftShell>
    </EngineAccessoryProvider>
  );
}
