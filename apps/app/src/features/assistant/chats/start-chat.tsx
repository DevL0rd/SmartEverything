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
import { ModelChip } from './model-chip';

const DRAFT_KEY = 'new-chat';

export function StartChat({
  onStarted,
}: {
  readonly onStarted: (chatId: string) => void;
}): ReactNode {
  const name = useAssistantName();
  const [engine, setEngine] = useDraftEngine();
  const keyed = useOpenRouterStatus().data?.key !== 'missing';
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: attachFiles, onHover: setDragging });
  const start = chatStarter(engine, (chatId) => {
    resetDraftEngine();
    onStarted(chatId);
  });
  return (
    <View ref={ref} className="min-h-0 flex-1 justify-between pb-safe-offset-3">
      <View className="flex-1 justify-center">
        {keyed ? (
          <EmptyChat
            name={name}
            onSuggest={(text) => {
              setDraft(DRAFT_KEY, text);
            }}
          />
        ) : (
          <NoKeyChat name={name} />
        )}
      </View>
      <View className="w-full max-w-reading self-center px-gutter">
        <Composer
          disabled={false}
          placeholder={`Message ${name}`}
          draftKey={DRAFT_KEY}
          send={start}
          focusOnMount
          shortcuts
          accessory={<ModelChip engine={engine} onChange={setEngine} />}
        />
      </View>
      {dragging ? <DropOverlay /> : null}
    </View>
  );
}
