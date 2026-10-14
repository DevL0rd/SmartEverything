import type { ReactNode } from 'react';
import type { HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import { useDraftEngine } from '../data/draft-engine';
import { DraftHeader } from './chat-header';
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
  readonly leading?: readonly HeaderAction[];
}): ReactNode {
  const [engine, setEngine] = useDraftEngine();
  const control = useEngineControls(engine, setEngine);
  useDraftKeys();
  return (
    <EngineAccessoryProvider value={control}>
      {back ? <HiddenNavigation /> : null}
      <Screen
        scroll={false}
        maxWidth="full"
        header={<DraftHeader engine={engine} back={back} leading={leading} />}
      >
        <StartChat onStarted={onStarted} />
      </Screen>
    </EngineAccessoryProvider>
  );
}
