import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { useToastObstacle } from '../../../components/toast-obstacles';
import { useSyncStatus } from '../../../store/selectors';
import { Composer } from '../components/composer';
import { counted } from '../../../perf/probe-kit';
import { useAssistantName } from '../data/assistant-data';
import { startEditing } from '../data/editing';
import { outboxSender } from '../data/outbox';
import { useLatestEditableId } from '../data/retry';
import { stopChat } from './chat-actions';
import { ChatFooterStrip } from './chat-footer-strip';
import { ChatModelChip } from './model-chip';
import { WebSearchButton } from './web-search-button';

export interface ThreadFooterProps {
  readonly chat: AiChatRow;
  readonly working: boolean;
  readonly onInfo: () => void;
}

function ThreadFooterBase({ chat, working, onInfo }: ThreadFooterProps): ReactNode {
  const name = useAssistantName();
  const status = useSyncStatus().status;
  const editable = useLatestEditableId(chat.id);
  const editLatest =
    editable === null
      ? null
      : (): void => {
          startEditing(editable);
        };
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  return (
    <View
      ref={attach}
      onLayout={counted('lay.foot', onLayout)}
      className="w-full max-w-reading gap-2 self-center px-gutter pb-safe-offset-3 pt-2"
    >
      <ChatFooterStrip chatId={chat.id} engine={chat.engine} onPress={onInfo} />
      <Composer
        disabled={false}
        placeholder={`Message ${name}`}
        draftKey={chat.id}
        send={outboxSender(chat.id, status === 'live')}
        stop={working ? (): void => void stopChat(chat.id) : null}
        offline={status === 'interrupted'}
        onEditLatest={editLatest}
        shortcuts
        accessory={
          <>
            <WebSearchButton chat={chat} />
            <ChatModelChip chat={chat} />
          </>
        }
      />
    </View>
  );
}

export const ThreadFooter = memo(ThreadFooterBase);
