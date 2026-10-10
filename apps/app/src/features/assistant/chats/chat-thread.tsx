import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import type { HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { olderChatMessages } from '../../../api/ai';
import { useFileDrop } from '../../../platform/file-drop';
import { EmptyChat } from '../components/chat-states';
import { Composer, type MessageSender } from '../components/composer';
import { DropOverlay } from '../components/drop-overlay';
import { ThreadList, type LiveStatus } from '../components/thread-list';
import { useAssistantName } from '../data/assistant-data';
import type { Turn } from '../../../store/chat-turns';
import { attachFiles } from '../data/uploads';
import { StreamingProvider } from '../components/streaming-context';
import { chatSender, stopChat } from './chat-actions';
import { ChatDetails } from './chat-details';
import { ChatHeader } from './chat-header';
import { ModelChip } from './model-chip';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import { StreamingBubble } from './streaming-bubble';

export interface ChatThreadProps {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly turn: Turn | null;
  readonly back: boolean;
  readonly onDeleted: () => void;
  readonly leading?: readonly HeaderAction[];
}

function running(turn: Turn | null): turn is Turn {
  return turn !== null && turn.state !== 'idle' && turn.state !== 'failed';
}

function hasWorkingRow(rows: readonly AssistantMessageRow[]): boolean {
  return rows.some((row) => row.role === 'responder' && row.state === 'working');
}

function liveOf(turn: Turn | null): LiveStatus | null {
  return running(turn) && turn.messageId !== null
    ? { requestId: turn.messageId, node: null }
    : null;
}

function Body({
  chat,
  rows,
  live,
  send,
  name,
}: {
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly live: LiveStatus | null;
  readonly send: MessageSender;
  readonly name: string;
}): ReactNode {
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: attachFiles, onHover: setDragging });
  return (
    <View ref={ref} className="flex-1">
      <ThreadList
        rows={rows}
        empty={<EmptyChat name={name} send={send} />}
        historyKey={chat.id}
        loadOlder={(before) => olderChatMessages(chat.id, before)}
        live={live}
      />
      {dragging ? <DropOverlay /> : null}
    </View>
  );
}

function ThreadFooter({
  chat,
  turn,
  rows,
  send,
}: {
  readonly chat: AiChatRow;
  readonly turn: Turn | null;
  readonly rows: readonly AssistantMessageRow[];
  readonly send: MessageSender;
}): ReactNode {
  const name = useAssistantName();
  const live = running(turn);
  return (
    <View className="w-full max-w-reading gap-2 self-center">
      {live && !hasWorkingRow(rows) ? <StreamingBubble turn={turn} fallback="" /> : null}
      <Composer
        disabled={false}
        placeholder={`Message ${name}`}
        draftKey={chat.id}
        send={send}
        stop={live ? (): void => void stopChat(chat.id) : null}
        accessory={<ModelChip chat={chat} />}
      />
    </View>
  );
}

function HiddenNavigation(): ReactNode {
  useHideNavigation();
  return null;
}

export function ChatThread({
  chat,
  rows,
  turn,
  back,
  onDeleted,
  leading = [],
}: ChatThreadProps): ReactNode {
  const name = useAssistantName();
  const [details, setDetails] = useState(false);
  const send = chatSender(chat.id);
  const live = running(turn);
  const renderWorking = (row: AssistantMessageRow): ReactNode => (
    <StreamingBubble turn={turn} fallback={row.text} />
  );
  return (
    <StreamingProvider value={renderWorking}>
      {back ? <HiddenNavigation /> : null}
      <Screen
        scroll={false}
        maxWidth="full"
        header={
          <ChatHeader
            chat={chat}
            working={live}
            back={back}
            leading={leading}
            onDetails={() => {
              setDetails(true);
            }}
            onDeleted={onDeleted}
          />
        }
        footer={<ThreadFooter chat={chat} turn={turn} rows={rows} send={send} />}
      >
        <Body chat={chat} rows={rows} live={liveOf(turn)} send={send} name={name} />
      </Screen>
      <ChatDetails
        chat={chat}
        rows={rows}
        open={details}
        onClose={() => {
          setDetails(false);
        }}
      />
    </StreamingProvider>
  );
}
