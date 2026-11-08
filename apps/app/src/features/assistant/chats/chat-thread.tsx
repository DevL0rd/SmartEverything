import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { olderChatMessages } from '../../../api/ai';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import type { HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { Banner } from '../../../components/banner';
import { EmptyState } from '../../../components/empty-state';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useFileDrop } from '../../../platform/file-drop';
import { EmptyChat } from '../components/chat-states';
import { DropOverlay } from '../components/drop-overlay';
import { PerfProbe } from '../../../perf/probe-kit';
import { ThreadBanners } from '../components/thread-banners';
import { ThreadList } from '../components/thread-list';
import { StatusAnnouncer } from '../components/status-announcer';
import { useAssistantName } from '../data/assistant-data';
import { useChatWorking } from '../data/chat-store';
import { usePendingMessages } from '../data/outbox';
import { attachFiles } from '../data/uploads';
import { ChatHeader, ChatHistoryHeader } from './chat-header';
import { appChatHistoryOnly } from './chat-visibility';
import { usePanelState, type PanelState } from './chat-panel-state';
import { BrowserPane } from './browser-panel';
import { useBrowserTabs } from '../browser/browser-tab-events';
import { useEmbeddedBrowserController } from '../browser/data/use-embedded-browser-controller';
import { ThreadFooter } from './chat-thread-footer';
import { useThreadKeys } from './chat-thread-keys';
import { ProviderRouteSheet } from '../provider/provider-route-sheet';
import { EngineAccessoryProvider, useEngineControls } from './engine-accessories';
import { useChatEngineChange } from './chat-engine-change';
import { useChatTrace } from './use-chat-trace';
import { ProviderPromptDock } from '../provider/provider-prompt-dock';
import { RoutedChatRename } from './chat-rename-sheet';

export interface ChatThreadProps {
  readonly active?: boolean;
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly back: boolean;
  readonly leading?: readonly HeaderAction[];
}

function ChatEmpty({ chat, name }: { readonly chat: AiChatRow; readonly name: string }): ReactNode {
  if (appChatHistoryOnly(chat)) {
    return (
      <EmptyState
        icon="messageCircle"
        title="No messages"
        body="This chat has no saved messages."
      />
    );
  }
  return <EmptyChat chat={chat} name={name} />;
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
  const historyOnly = appChatHistoryOnly(chat);
  useFileDrop(ref, {
    onFiles: (files) => {
      if (!historyOnly) attachFiles(files);
    },
    onHover: (hovering) => {
      setDragging(!historyOnly && hovering);
    },
  });
  return (
    <View ref={ref} className="min-h-0 flex-1">
      <View className="min-h-0 flex-1">
        <PerfProbe id="list">
          <ThreadList
            rows={rows}
            empty={<ChatEmpty chat={chat} name={name} />}
            historyKey={chat.id}
            loadOlder={(before) => olderChatMessages(chat.id, before)}
          />
        </PerfProbe>
      </View>
      {historyOnly ? null : <StatusAnnouncer key={chat.id} chatId={chat.id} />}
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
  working,
}: Pick<ChatThreadProps, 'chat' | 'rows'> & { readonly working: boolean }): ReactNode {
  const name = useAssistantName();
  return (
    <Screen scroll={false} maxWidth="full" banner={<ThreadBanners />}>
      <Body chat={chat} rows={rows} name={name} />
      <ProviderPromptDock chat={chat} />
      <ProviderRouteSheet chat={chat} />
      <View className="relative shrink-0">
        <PerfProbe id="foot">
          <ThreadFooter chat={chat} working={working} />
        </PerfProbe>
      </View>
    </Screen>
  );
}

function ThreadPanes({
  chat,
  rows,
  panel,
  working,
  active,
}: Pick<ChatThreadProps, 'chat' | 'rows'> & {
  readonly panel: PanelState;
  readonly working: boolean;
  readonly active: boolean;
}): ReactNode {
  const browser = useBrowserTabs(chat, active && panel.open);
  useEmbeddedBrowserController(chat, browser.tabs, active);
  const motion = useMotion();
  return (
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
        style={panel.open && !panel.docked ? { display: 'none' } : undefined}
        className="min-w-0 flex-1"
      >
        <PerfProbe id="thread">
          {active ? <Column key={chat.id} chat={chat} rows={rows} working={working} /> : null}
        </PerfProbe>
      </Animated.View>
      <BrowserPane chat={chat} panel={panel} browser={browser} active={active} />
    </View>
  );
}

function LiveThread(props: ChatThreadProps): ReactNode {
  const { chat, rows, back, leading = [] } = props;
  const browserToggleRef = useRef<View>(null);
  const panel = usePanelState(browserToggleRef);
  const active = props.active !== false;
  useThreadKeys(chat.id, rows, panel, active);
  const control = useEngineControls(chat.engine, useChatEngineChange(chat), chat);
  const live = useChatWorking(chat.id);
  const waiting = usePendingMessages(chat.id).length;
  useChatTrace(chat, rows, active, live);
  return (
    <EngineAccessoryProvider value={control}>
      <View className="min-h-0 flex-1">
        {active ? (
          <ChatHeader
            chat={chat}
            rows={rows}
            working={live}
            waiting={waiting}
            back={back}
            leading={leading}
            panel={panel}
            ref={browserToggleRef}
          />
        ) : null}
        {back && active ? <HiddenNavigation /> : null}
        <ThreadPanes chat={chat} rows={rows} panel={panel} working={live} active={active} />
      </View>
      {active ? <RoutedChatRename chat={chat} /> : null}
    </EngineAccessoryProvider>
  );
}

function HistoryThread({ chat, rows, back, leading = [] }: ChatThreadProps): ReactNode {
  const name = useAssistantName();
  return (
    <>
      <ChatHistoryHeader title={chat.title} back={back} leading={leading} />
      {back ? <HiddenNavigation /> : null}
      <Screen
        scroll={false}
        maxWidth="full"
        banner={
          <Banner
            tone="info"
            title="Chat history"
            body="You can read this chat. Start a new chat to send a message."
            wrapBody
          />
        }
      >
        <Body chat={chat} rows={rows} name={name} />
      </Screen>
    </>
  );
}

export function ChatThread(props: ChatThreadProps): ReactNode {
  if (!appChatHistoryOnly(props.chat)) return <LiveThread {...props} />;
  return props.active === false ? null : <HistoryThread {...props} />;
}
