import { useRef, useState, type ReactNode } from 'react';
import { type TextInput, View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { useActiveProfile } from '../../../store/people';
import { usePausable } from '../../../design/external-store';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { useAnchoredMenu } from '../../../components/menu';
import { BrowserActionScope } from '../browser/browser-action-scope';
import type { BrowserAction } from '../browser/browser-actions';
import { useRequestedBrowserAction } from '../browser/browser-requested-action';
import { IconButton } from '../../../components/icon-button';
import { BrowserTabStrip } from '../browser/browser-tab-strip';
import { BrowserConsole } from '../browser/browser-console';
import { BrowserTabPage } from '../browser/browser-tab-page';
import { BrowserBlankPage } from '../browser/browser-blank-page';
import { BrowserToolbar } from '../browser/browser-toolbar';
import { EMPTY_BROWSER_STATUS } from '../browser/browser-tab-state';
import { announcedBrowserTabOperation, openBrowserAddress } from '../browser/browser-tab-operation';
import { focusBrowserTab } from '../browser/browser-tab-strip-keyboard';
import type { BrowserTabs } from '../browser/browser-tabs';
interface HarnessBrowserProps {
  readonly chat: AiChatRow;
  readonly visible: boolean;
  readonly tabs: BrowserTabs;
}
export function HarnessBrowser(props: HarnessBrowserProps): ReactNode {
  const profile = useActiveProfile();
  if (profile?.id !== props.chat.profile_id)
    return (
      <View className="min-h-0 flex-1 items-center justify-center gap-2 px-6">
        <Text variant="title-3">Switch profile</Text>
        <Text tone="variant">Switch to this conversation’s profile to use its browser.</Text>
      </View>
    );
  return <ChatBrowser {...props} />;
}
function ChatBrowser({ chat, visible, tabs }: HarnessBrowserProps): ReactNode {
  const snapshot = usePausable(tabs.subscribe, tabs.read);
  const target = snapshot.tabs.find((tab) => tab.id === snapshot.selectedId)?.selection?.target;
  const onNew = (): void => {
    newBrowserTab(tabs);
  };
  return (
    <View className="min-h-0 min-w-0 flex-1 pb-safe">
      <BrowserTabStrip
        tabs={snapshot.tabs}
        selectedId={snapshot.selectedId}
        onSelect={(id) => {
          tabs.select(id);
        }}
        onClose={(id) => {
          announcedBrowserTabOperation(tabs.close(id));
          focusBrowserTab(tabs.read().selectedId);
        }}
        onNew={onNew}
        onReorder={(ids) => {
          tabs.reorder(ids);
        }}
      />
      <View className="relative min-h-0 flex-1 overflow-hidden">
        {snapshot.tabs.length === 0 ? (
          <BrowserActionScope value={visible}>
            <EmptyBrowser tabs={tabs} onNew={onNew} />
          </BrowserActionScope>
        ) : (
          snapshot.tabs.map((tab) => (
            <BrowserTabPage
              key={tab.id}
              chat={chat}
              tabs={tabs}
              tab={tab}
              selected={snapshot.selectedId === tab.id}
              visible={visible}
              onNew={onNew}
            />
          ))
        )}
      </View>
      {target === undefined ? null : (
        <BrowserConsole chat={chat} targetId={target.id} visible={visible} repair={tabs.repair} />
      )}
    </View>
  );
}
function EmptyBrowser({
  tabs,
  onNew,
}: Pick<HarnessBrowserProps, 'tabs'> & { readonly onNew: () => void }): ReactNode {
  const [address, setAddress] = useState('');
  const inputRef = useRef<TextInput>(null);
  const { ref, open, menu } = useAnchoredMenu(
    [{ label: 'New tab', icon: 'plus', onPress: onNew }],
    'Browser options',
  );
  useRequestedBrowserAction({
    'new-tab': onNew,
    'close-tab': notifyTabRequired,
    'tab-earlier': notifyTabRequired,
    'tab-later': notifyTabRequired,
    address: (): void => {
      inputRef.current?.focus();
    },
    menu: open,
    reload: notifyTabRequired,
    copy: notifyTabRequired,
  } satisfies Readonly<Record<BrowserAction, () => void>>);
  const noop = (): void => undefined;
  const controls = { navigate: noop, back: noop, forward: noop, reload: noop, stop: noop };
  return (
    <>
      <BrowserToolbar
        address={address}
        onAddress={setAddress}
        onEditing={noop}
        inputRef={inputRef}
        navigate={() => {
          openBrowserAddress(tabs, address);
        }}
        status={EMPTY_BROWSER_STATUS}
        controls={controls}
        ready={false}
        tools={
          <View ref={ref} collapsable={false}>
            <IconButton icon="ellipsisVertical" label="Browser options" onPress={open} />
            {menu}
          </View>
        }
      />
      <BrowserBlankPage />
    </>
  );
}

function notifyTabRequired(): void {
  notify({ message: 'Open a browser tab first.', tone: 'default' });
}

function newBrowserTab(tabs: BrowserTabs): void {
  try {
    tabs.blank();
  } catch (error: unknown) {
    notify({
      message: error instanceof Error ? error.message : 'A browser tab could not be opened.',
      tone: 'default',
    });
  }
}
