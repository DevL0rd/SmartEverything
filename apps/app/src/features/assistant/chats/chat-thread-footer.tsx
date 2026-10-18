import { useProviderWorking } from '../provider/provider-working';
import { ChatSubscriptionUsage } from '../provider/subscription-usage';
import { ProviderWorkButton } from '../provider/runtime-work-sheet';
import { isComputerEngine } from '../provider/computer-engine';
import type { ReactNode } from 'react';
import { memo, useRef, type RefObject } from 'react';
import { View } from 'react-native';
import { useIsFocused } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { useComposerGuards } from './composer-guards';
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
import { useEngineUnavailableReason } from '../provider/engine-availability';
import { ContextRing } from '../components/context-ring';
import { Text } from '../../../components/text';
import { useSizeClass } from '../../../design/size-class';
import { useContextUsage } from '../data/context-usage';
import { background } from '@smarteverything/logging';

const READ_ONLY_REASON = 'Only the owner can work in this computer chat.';

function ContextMeter({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const short = useSizeClass().height === 'compact';
  const { percent } = useContextUsage(chat);
  if (!short || percent === null) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Context ${String(percent)} %`}
      className="flex-row items-center gap-1.5 px-1"
    >
      <ContextRing percent={percent} size={16} />
      <Text variant="footnote" tone="variant" className="tabular">
        {`${String(percent)}%`}
      </Text>
    </View>
  );
}

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
    <>
      <ContextMeter chat={chat} />
      <ModelChip engine={chat.engine} onChange={onChange} blocked={blocked} anchorRef={anchorRef} />
    </>
  );
}

export interface ThreadFooterProps {
  readonly chat: AiChatRow;
  readonly working: boolean;
  readonly onInfo: () => void;
  readonly onCompose: () => void;
}

interface FooterComposerProps {
  readonly chat: AiChatRow;
  readonly readOnly: boolean;
  readonly busy: boolean;
  readonly nativeWorking: boolean;
  readonly unavailable: string | null;
  readonly onCompose: () => void;
}

function FooterComposer({
  chat,
  readOnly,
  busy,
  nativeWorking,
  unavailable,
  onCompose,
}: FooterComposerProps): ReactNode {
  const name = useAssistantName();
  const change = useChatEngineChange(chat);
  const guards = useComposerGuards(chat, readOnly);
  const status = useSyncStatus().status;
  const editLatest = editAction(useLatestEditableId(chat.id), readOnly);
  const cardRef = useRef<View>(null);
  return (
    <View ref={cardRef}>
      <Composer
        disabled={readOnly}
        reason={unavailable ?? (readOnly ? READ_ONLY_REASON : null)}
        {...guards}
        placeholder={`Message ${name}`}
        draftKey={chat.id}
        queueFor={chat.id}
        commandChat={chat}
        send={outboxSender(chat.id, status === 'live')}
        stop={stopAction(chat.id, readOnly, busy)}
        onEditLatest={editLatest}
        shortcuts
        onFocus={onCompose}
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

function ThreadFooterBase({ chat, working, onInfo, onCompose }: ThreadFooterProps): ReactNode {
  const nativeWorking = useProviderWorking(chat);
  const owner = useIsOwner();
  const unavailable = useEngineUnavailableReason(chat.engine);
  const readOnly = isComputerEngine(chat.engine) && !owner;
  const busy = working || nativeWorking;
  const compactBlocked = readOnly || busy || unavailable !== null;
  const { attach, onLayout } = useToastObstacle('bottom', useIsFocused());
  return (
    <View
      ref={attach}
      onLayout={counted('lay.foot', onLayout)}
      className="w-full max-w-reading gap-2 self-center px-gutter pb-safe-offset-3 pt-2"
    >
      <ChatSubscriptionUsage chat={chat} compact />
      <ChatFooterStrip chat={chat} blocked={compactBlocked} onPress={onInfo} />
      <FooterComposer
        chat={chat}
        readOnly={readOnly}
        busy={busy}
        nativeWorking={nativeWorking}
        unavailable={unavailable}
        onCompose={onCompose}
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
    background(stopChat(chatId), 'chat.stop_failed');
  };
}
