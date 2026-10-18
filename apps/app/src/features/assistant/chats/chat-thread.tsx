import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import type { AiChatRow, AssistantMessageRow } from '@smarteverything/domain';
import { olderChatMessages } from '../../../api/ai';
import { useHideNavigation } from '../../../app-shell/nav-visibility';
import type { HeaderAction } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { DURATION, EASING, useMotion } from '../../../design/motion';
import { useFileDrop } from '../../../platform/file-drop';
import { EmptyChat } from '../components/chat-states';
import { DropOverlay } from '../components/drop-overlay';
import { PerfProbe } from '../../../perf/probe-kit';
import { ThreadBanners } from '../components/thread-banners';
import { ThreadList } from '../components/thread-list';
import { ChatDetails } from '../details/chat-details';
import { useComposerCollapse } from '../details/use-composer-collapse';
import { useAssistantName } from '../data/assistant-data';
import { useChatWorking } from '../data/chat-store';
import { setDraft } from '../data/drafts';
import { usePendingMessages } from '../data/outbox';
import { attachFiles } from '../data/uploads';
import { ChatHeader } from './chat-header';
import { usePanelState } from './chat-panel-state';
import { BrowserPane } from './browser-panel';
import { useBrowserTabs } from '../browser/browser-tab-events';
import { useEmbeddedBrowserController } from '../browser/data/use-embedded-browser-controller';
import { useChatInfo } from './chat-info-state';
import { ThreadFooter } from './chat-thread-footer';
import { useThreadKeys } from './chat-thread-keys';
import { ProviderRouteSheet } from '../provider/provider-route-sheet';
import { EngineAccessoryProvider, useEngineControls } from './engine-accessories';
import { useChatEngineChange } from './chat-engine-change';
import { useChatTrace } from './use-chat-trace';
import { ProviderPromptDock } from '../provider/provider-prompt-dock';

export interface ChatThreadProps {
  readonly active?: boolean;
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
  behindRef,
  children,
}: {
  readonly active?: boolean;
  readonly chat: AiChatRow;
  readonly rows: readonly AssistantMessageRow[];
  readonly name: string;
  readonly behindRef: RefObject<View | null>;
  readonly children: ReactNode;
}): ReactNode {
  const ref = useRef<View>(null);
  const [dragging, setDragging] = useState(false);
  useFileDrop(ref, { onFiles: attachFiles, onHover: setDragging });
  return (
    <View ref={ref} className="min-h-0 flex-1">
      <View ref={behindRef} className="min-h-0 flex-1">
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
      </View>
      {dragging ? <DropOverlay /> : null}
      {children}
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
  onDeleted,
  working,
}: ChatThreadProps & { readonly working: boolean }): ReactNode {
  const name = useAssistantName();
  const info = useChatInfo();
  const behind = useRef<View>(null);
  const compose = useComposerCollapse(info.open, info.hide);
  return (
    <>
      <Screen scroll={false} maxWidth="full" banner={<ThreadBanners />}>
        <Body chat={chat} rows={rows} name={name} behindRef={behind}>
          <ChatDetails
            chat={chat}
            rows={rows}
            open={info.open}
            target={info.target}
            behindRef={behind}
            onClose={info.hide}
            onDeleted={onDeleted}
          />
        </Body>
        <ProviderPromptDock chat={chat} />
        <ProviderRouteSheet chat={chat} />
        <PerfProbe id="foot">
          <ThreadFooter chat={chat} working={working} onInfo={info.show} onCompose={compose} />
        </PerfProbe>
      </Screen>
    </>
  );
}

export function ChatThread(props: ChatThreadProps): ReactNode {
  const { chat, rows, back, leading = [] } = props;
  const panel = usePanelState();
  const active = props.active !== false;
  const browser = useBrowserTabs(chat, active && panel.open);
  useEmbeddedBrowserController(chat, browser.tabs, active);
  const motion = useMotion();
  useThreadKeys(chat.id, rows, panel, active);
  const control = useEngineControls(chat.engine, useChatEngineChange(chat), chat);
  const live = useChatWorking(chat.id);
  const waiting = usePendingMessages(chat.id).length;
  useChatTrace(chat, rows, active, live);
  return (
    <EngineAccessoryProvider value={control}>
      {active ? (
        <ChatHeader
          chat={chat}
          rows={rows}
          working={live}
          waiting={waiting}
          back={back}
          leading={leading}
          panel={{ open: panel.open, toggle: panel.toggle }}
        />
      ) : null}
      {back && active ? <HiddenNavigation /> : null}
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
          <PerfProbe id="thread">{active ? <Column {...props} working={live} /> : null}</PerfProbe>
        </Animated.View>
        <BrowserPane chat={chat} panel={panel} browser={browser} active={active} />
      </View>
    </EngineAccessoryProvider>
  );
}
