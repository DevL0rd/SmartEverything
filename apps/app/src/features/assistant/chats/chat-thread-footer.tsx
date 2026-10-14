import { useProviderWorking } from '../provider/provider-working';
import { ChatSubscriptionUsage } from '../provider/subscription-usage';
import { useCodexAttachmentReason } from '../provider/codex-attachments';
import { ExecutionContext } from '../provider/execution-context';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { useToastObstacle } from '../../../components/toast-obstacles';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { Composer } from '../components/composer';
import { counted } from '../../../perf/probe-kit';
import { useAssistantName } from '../data/assistant-data';
import { startEditing } from '../data/editing';
import { outboxSender } from '../data/outbox';
import { useLatestEditableId } from '../data/retry';
import { stopChat } from './chat-actions';
import { ChatFooterStrip } from './chat-footer-strip';
import { PermissionControl } from './permission-control';
import { ModelChip } from './model-chip';
import { useChatEngineChange } from './chat-engine-change';
import { Text } from '../../../components/text';
import { useEngineUnavailableReason } from '../provider/engine-availability';

export interface ThreadFooterProps {
  readonly chat: AiChatRow;
  readonly working: boolean;
  readonly onInfo: () => void;
}

function ThreadFooterBase({ chat, working, onInfo }: ThreadFooterProps): ReactNode {
  const name = useAssistantName();
  const change = useChatEngineChange(chat);
  const nativeWorking = useProviderWorking(chat);
  const owner = useIsOwner();
  const unavailable = useEngineUnavailableReason(chat.engine);
  const attachmentReason = useCodexAttachmentReason(chat);
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const status = useSyncStatus().status;
  const editable = useLatestEditableId(chat.id);
  const editLatest = editAction(editable, readOnly);
  const busy = working || nativeWorking;
  const compactBlocked = readOnly || busy || unavailable !== null;
  const stop = stopAction(chat.id, readOnly, busy);
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  return (
    <View
      ref={attach}
      onLayout={counted('lay.foot', onLayout)}
      className="w-full max-w-reading gap-2 self-center px-gutter pb-safe-offset-3 pt-2"
    >
      <ExecutionContext chat={chat} />
      <ChatSubscriptionUsage chat={chat} compact />
      <ChatFooterStrip chat={chat} blocked={compactBlocked} onPress={onInfo} />
      {attachmentReason === null ? null : <Text tone="warning">{attachmentReason}</Text>}
      <Composer
        disabled={readOnly}
        sendDisabled={unavailable !== null || attachmentReason !== null}
        placeholder={`Message ${name}`}
        draftKey={chat.id}
        commandChat={chat}
        send={outboxSender(chat.id, status === 'live')}
        stop={stop}
        onEditLatest={editLatest}
        shortcuts
        offline={status === 'interrupted'}
        rightAccessory={
          <ModelChip
            engine={chat.engine}
            onChange={change}
            blocked={readOnly || (isComputerEngine(chat.engine) && nativeWorking)}
          />
        }
        accessory={<PermissionControl engine={chat.engine} chat={chat} onChange={change} />}
      />
    </View>
  );
}

export const ThreadFooter = memo(ThreadFooterBase);

function editAction(editable: string | null, readOnly: boolean): (() => void) | null {
  return editable === null || readOnly
    ? null
    : (): void => {
        startEditing(editable);
      };
}

function stopAction(chatId: string, readOnly: boolean, working: boolean): (() => void) | null {
  if (readOnly || !working) return null;
  return (): void => {
    void stopChat(chatId);
  };
}
