import { useProviderWorking } from '../provider/provider-working';
import { ProviderWorkButton } from '../provider/runtime-work-sheet';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { memo, useRef, type RefObject } from 'react';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { useComposerGuards } from './composer-guards';
import { useKeyboardVisible, useToastObstacle } from '../../../components/toast-obstacles';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { Composer } from '../components/composer';
import { counted } from '../../../perf/probe-kit';
import { useAssistantName } from '../data/assistant-data';
import { startEditing } from '../data/editing';
import { outboxSender } from '../data/outbox';
import { useLatestEditableId } from '../data/retry';
import { stopChat } from './chat-actions';
import { PermissionControl } from './permission-control';
import { ModelChip } from './model-chip';
import { useChatEngineChange } from './chat-engine-change';
import { useEngineUnavailableReason } from '../provider/engine-availability';
import { ChatFooterStrip } from './chat-footer-strip';
import { background } from '@smarteverything/logging';

const READ_ONLY_REASON = 'Only the owner can work in this computer chat.';

function ModelControls({
  chat,
  onChange,
  blocked,
  anchorRef,
}: {
  readonly chat: AiChatRow;
  readonly onChange: (engine: AiChatRow['engine']) => void;
  readonly blocked: boolean;
  readonly anchorRef: RefObject<View | null>;
}): ReactNode {
  return (
    <ModelChip
      engine={chat.engine}
      onChange={onChange}
      blocked={blocked}
      anchorRef={anchorRef}
      machineInHeader
    />
  );
}

export interface ThreadFooterProps {
  readonly chat: AiChatRow;
  readonly working: boolean;
}

interface FooterComposerProps {
  readonly chat: AiChatRow;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly nativeWorking: boolean;
  readonly unavailable: string | null;
}

function FooterComposer({
  chat,
  readOnly,
  busy,
  nativeWorking,
  unavailable,
}: FooterComposerProps): ReactNode {
  const name = useAssistantName();
  const change = useChatEngineChange(chat);
  const guards = useComposerGuards(chat, readOnly);
  const status = useSyncStatus().status;
  const editLatest = editAction(useLatestEditableId(chat.id), readOnly);
  const cardRef = useRef<View>(null);
  return (
    <View ref={cardRef} className="shrink-0">
      <Composer
        disabled={readOnly}
        reason={unavailable ?? (readOnly ? READ_ONLY_REASON : null)}
        {...guards}
        placeholder={`Message ${name}`}
        draftKey={chat.id}
        queueFor={chat.id}
        commandChat={chat}
        helperOnline={status === 'live'}
        send={outboxSender(chat.id, status === 'live')}
        stop={stopAction(chat.id, readOnly, busy)}
        onEditLatest={editLatest}
        shortcuts
        offline={status === 'interrupted'}
        rightAccessory={
          <ModelControls
            chat={chat}
            onChange={change}
            blocked={readOnly || (isComputerEngine(chat.engine) && nativeWorking)}
            anchorRef={cardRef}
          />
        }
        accessory={<PermissionControl engine={chat.engine} chat={chat} onChange={change} />}
        tools={<ProviderWorkButton chat={chat} />}
      />
    </View>
  );
}

function ThreadFooterBase({ chat, working }: ThreadFooterProps): ReactNode {
  const nativeWorking = useProviderWorking(chat);
  const owner = useIsOwner();
  const unavailable = useEngineUnavailableReason(chat.engine);
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const busy = working || nativeWorking;
  const keyboardVisible = useKeyboardVisible();
  const compactBlocked = readOnly || busy || unavailable !== null;
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  return (
    <View
      ref={attach}
      onLayout={counted('lay.foot', onLayout)}
      className="w-full shrink-0 gap-2 pb-safe-offset-3 pt-2"
    >
      <ChatFooterStrip
        key={chat.id}
        chat={chat}
        blocked={compactBlocked}
        working={working}
        keyboardVisible={keyboardVisible}
      />
      <View className="w-full px-gutter">
        <FooterComposer
          chat={chat}
          readOnly={readOnly}
          busy={busy}
          nativeWorking={nativeWorking}
          unavailable={unavailable}
        />
      </View>
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
    background(stopChat(chatId), 'chat.stop_failed');
  };
}
