import type { ReactNode } from 'react';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition, SlideInRight, SlideOutRight } from 'react-native-reanimated';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { olderChatMessages } from '../../../api/ai';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import type { HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { DURATION, EASING, entering, exiting, useMotion } from '../../../design/motion';
import { useFileDrop } from '../../../platform/file-drop';
import { EmptyChat } from '../components/chat-states';
import { DropOverlay } from '../components/drop-overlay';
import { PerfProbe } from '../../../perf/probe-kit';
import { ThreadBanners } from '../components/thread-banners';
import { ThreadList } from '../components/thread-list';
import { useAssistantName } from '../data/assistant-data';
import { useChatWorking } from '../data/chat-store';
import { setDraft } from '../data/drafts';
import { usePendingMessages } from '../data/outbox';
import { statusRequestOf } from '../data/thread';
import { attachFiles } from '../data/uploads';
import { ChatHeader } from './chat-header';
import { usePanelState, type PanelState } from './chat-panel-state';
import { ChatPanel, ChatSheet } from './chat-sheet';
import { ThreadFooter } from './chat-thread-footer';
import { useThreadKeys } from './chat-thread-keys';
import { ChatStatusDock } from './chat-status-box';

export interface ChatThreadProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly back: boolean;
  readonly onDeleted: () => void;
  readonly leading?: readonly HeaderAction[];
}

function Body({
  chat,
  rows,
  name,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly name: string;
}): ReactNode {
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: attachFiles, onHover: setDragging });
  return (
    <View ref={ref} className="min-h-0 flex-1">
      <PerfProbe id="list">
        <ThreadList
          rows={rows}
          empty={
            <EmptyChat
              name={name}
              onSuggest={(text) => {
                setDraft(chat.id, text);
              }}
            />
          }
          historyKey={chat.id}
          loadOlder={(before) => olderChatMessages(chat.id, before)}
        />
      </PerfProbe>
      {dragging ? <DropOverlay /> : null}
    </View>
  );
}

function HiddenNavigation(): ReactNode {
  useHideNavigation();
  return null;
}

function Column({
  chat,
  rows,
  back,
  leading,
  panel,
  onDeleted,
}: ChatThreadProps & {
  readonly leading: readonly HeaderAction[];
  readonly panel: PanelState;
}): ReactNode {
  const name = useAssistantName();
  const live = useChatWorking(chat.id);
  const waiting = usePendingMessages(chat.id).length;
  const request = useMemo(() => statusRequestOf(rows), [rows]);
  return (
    <Screen
      scroll={false}
      maxWidth="full"
      banner={<ThreadBanners />}
      header={
        <ChatHeader
          chat={chat}
          working={live}
          waiting={waiting}
          back={back}
          leading={leading}
          onInfo={panel.show}
          panel={{ open: panel.open, toggle: panel.toggle }}
        />
      }
    >
      <Body chat={chat} rows={rows} name={name} />
      <PerfProbe id="dock">
        <ChatStatusDock chatId={chat.id} request={request} />
      </PerfProbe>
      <PerfProbe id="foot">
        <ThreadFooter chat={chat} working={live} onInfo={panel.show} />
      </PerfProbe>
      <PanelHost chat={chat} rows={rows} panel={panel} onDeleted={onDeleted} />
    </Screen>
  );
}

function PanelHost({
  chat,
  rows,
  panel,
  onDeleted,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly panel: PanelState;
  readonly onDeleted: () => void;
}): ReactNode {
  return panel.docked ? null : (
    <ChatSheet
      chat={chat}
      rows={rows}
      open={panel.overlay}
      onClose={panel.hide}
      onDeleted={onDeleted}
    />
  );
}

function DockedPanel({
  chat,
  rows,
  onClose,
  onDeleted,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly onClose: () => void;
  readonly onDeleted: () => void;
}): ReactNode {
  const motion = useMotion();
  return (
    <Animated.View
      {...entering(motion, SlideInRight.duration(DURATION.medium).easing(EASING.standard))}
      {...exiting(motion, SlideOutRight.duration(DURATION.medium).easing(EASING.standard))}
    >
      <ChatPanel chat={chat} rows={rows} onClose={onClose} onDeleted={onDeleted} />
    </Animated.View>
  );
}

export function ChatThread(props: ChatThreadProps): ReactNode {
  const { chat, rows, back, onDeleted, leading = [] } = props;
  const panel = usePanelState();
  const motion = useMotion();
  useThreadKeys(chat.id, rows, panel);
  return (
    <>
      {back ? <HiddenNavigation /> : null}
      <View
        className="min-h-0 flex-1 flex-row"
        onLayout={(event) => {
          panel.measure(event.nativeEvent.layout.width);
        }}
      >
        <Animated.View
          {...(motion.reduced
            ? {}
            : { layout: LinearTransition.duration(DURATION.medium).easing(EASING.standard) })}
          className="min-w-0 flex-1"
        >
          <PerfProbe id="thread">
            <Column {...props} leading={leading} panel={panel} />
          </PerfProbe>
        </Animated.View>
        {panel.docked ? (
          <DockedPanel chat={chat} rows={rows} onClose={panel.hide} onDeleted={onDeleted} />
        ) : null}
      </View>
    </>
  );
}
