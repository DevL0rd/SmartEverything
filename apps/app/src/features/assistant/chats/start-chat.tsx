import { appPlatform } from '../../../design/platform';
import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { EmptyChat, NoKeyChat } from '../components/chat-states';
import { Composer } from '../components/composer';
import { DropOverlay } from '../components/drop-overlay';
import { useAssistantName } from '../data/assistant-data';
import { resetDraftEngine, useDraftEngine } from '../data/draft-engine';
import { setDraft } from '../data/drafts';
import { useOpenRouterStatus } from '../data/openrouter';
import { attachFiles } from '../data/uploads';
import { useFileDrop } from '../../../platform/file-drop';
import { chatStarter } from './chat-actions';
import { Text } from '../../../components/text';
import { useEngineUnavailableReason } from '../provider/engine-availability';
import { ModelChip } from './model-chip';
import { PermissionControl } from './permission-control';
import { useDraftExecution } from '../data/draft-execution';

const DRAFT_KEY = 'new-chat';

function DraftAvailability(): ReactNode {
  return (
    <Text tone="variant">
      {appPlatform() === 'desktop'
        ? 'Waiting for this computer’s runtime. Start or reconnect it to continue.'
        : 'Loading the saved default engine… Choose a model explicitly to continue.'}
    </Text>
  );
}

export function StartChat({
  onStarted,
}: {
  readonly onStarted: (chatId: string) => void;
}): ReactNode {
  const name = useAssistantName();
  const [engine, setEngine, ready] = useDraftEngine();
  const execution = useDraftExecution(engine);
  const unavailable = useEngineUnavailableReason(execution.engine ?? engine);
  const keyed = useOpenRouterStatus().data?.key !== 'missing' || engine.kind !== 'openrouter';
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: attachFiles, onHover: setDragging });
  const start = chatStarter(
    engine,
    (chatId) => {
      resetDraftEngine();
      onStarted(chatId);
    },
    execution.resolve,
  );
  return (
    <View ref={ref} className="min-h-0 flex-1 justify-between pb-safe-offset-3">
      <View className="flex-1 justify-center">
        <DraftGreeting keyed={keyed} name={name} />
      </View>
      <View className="w-full max-w-reading gap-2 self-center px-gutter">
        {ready ? null : <DraftAvailability />}
        {execution.reason === null ? null : <Text tone="variant">{execution.reason}</Text>}
        <Composer
          disabled={!ready || unavailable !== null || execution.engine === null}
          placeholder={`Message ${name}`}
          draftKey={DRAFT_KEY}
          send={start}
          focusOnMount
          shortcuts
          accessory={<PermissionControl engine={engine} onChange={setEngine} />}
          rightAccessory={<ModelChip engine={engine} onChange={setEngine} />}
        />
      </View>
      {dragging ? <DropOverlay /> : null}
    </View>
  );
}

function DraftGreeting({
  keyed,
  name,
}: {
  readonly keyed: boolean;
  readonly name: string;
}): ReactNode {
  return keyed ? (
    <EmptyChat
      name={name}
      onSuggest={(text): void => {
        setDraft(DRAFT_KEY, text);
      }}
    />
  ) : (
    <NoKeyChat name={name} />
  );
}
