import { useRef, useState, type ReactNode } from 'react';
import { type TextInput, View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { useActiveProfile } from '../../../store/people';
import { usePausable } from '../../../design/external-store';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { useAnchoredMenu } from '../../../components/menu';
import { useRequestedBrowserAction } from '../browser/browser-requested-action';
import { IconButton } from '../../../components/icon-button';
import { BrowserTabStrip } from '../browser/browser-tab-strip';
import { BrowserTabPage } from '../browser/browser-tab-page';
import { BrowserBlankPage } from '../browser/browser-blank-page';
import { BrowserToolbar } from '../browser/browser-toolbar';
import {
  browserPublicationAvailability,
  browserPublications,
} from '../browser/browser-publications';
import { EMPTY_BROWSER_STATUS } from '../browser/browser-tab-state';
import { browserTabOperation } from '../browser/browser-tab-operation';
import { focusBrowserTab } from '../browser/browser-tab-strip-keyboard';
import type { BrowserTabs } from '../browser/browser-tabs';
import type { usePreviews } from '../data/previews';
interface HarnessBrowserProps {
  readonly chat: AiChatRow;
  readonly visible: boolean;
  readonly tabs: BrowserTabs;
  readonly catalogue: ReturnType<typeof usePreviews>;
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
function ChatBrowser({ chat, visible, tabs, catalogue }: HarnessBrowserProps): ReactNode {
  const snapshot = usePausable(tabs.subscribe, tabs.read);
  const publications = browserPublications(catalogue.data);
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
          browserTabOperation(tabs.close(id));
          focusBrowserTab(tabs.read().selectedId);
        }}
        onNew={onNew}
        onReorder={(ids) => {
          tabs.reorder(ids);
        }}
      />
      <View className="relative min-h-0 flex-1 overflow-hidden">
        {snapshot.tabs.length === 0 ? (
          <EmptyBrowser tabs={tabs} catalogue={catalogue} onNew={onNew} />
        ) : (
          snapshot.tabs.map((tab) => (
            <BrowserTabPage
              key={tab.id}
              chat={chat}
              tabs={tabs}
              tab={tab}
              selected={snapshot.selectedId === tab.id}
              visible={visible}
              publications={publications}
              available={browserPublicationAvailability(catalogue.data)}
              onNew={onNew}
            />
          ))
        )}
      </View>
    </View>
  );
}
function EmptyBrowser({
  tabs,
  catalogue,
  onNew,
}: Pick<HarnessBrowserProps, 'tabs' | 'catalogue'> & { readonly onNew: () => void }): ReactNode {
  const [address, setAddress] = useState('');
  const inputRef = useRef<TextInput>(null);
  useRequestedBrowserAction({
    'new-tab': onNew,
    address: (): void => {
      inputRef.current?.focus();
    },
  });
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
          try {
            const id = tabs.blank();
            tabs.address(id, address);
            browserTabOperation(tabs.navigate(id, address));
          } catch (error: unknown) {
            notify({ message: 'A browser tab could not be opened.', error, tone: 'default' });
          }
        }}
        status={EMPTY_BROWSER_STATUS}
        controls={controls}
        ready={false}
        tools={<EmptyBrowserTools onNew={onNew} />}
      />
      <BrowserBlankPage
        publications={browserPublications(catalogue.data)}
        available={browserPublicationAvailability(catalogue.data)}
        onSelect={(publication) => {
          browserTabOperation(tabs.openPublication(publication));
        }}
      />
    </>
  );
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

function EmptyBrowserTools({ onNew }: { readonly onNew: () => void }): ReactNode {
  const { ref, open, menu } = useAnchoredMenu(
    [{ label: 'New tab', icon: 'plus', onPress: onNew }],
    'Browser options',
  );
  useRequestedBrowserAction({ menu: open });
  return (
    <View ref={ref} collapsable={false}>
      <IconButton icon="ellipsisVertical" label="Browser options" onPress={open} />
      {menu}
    </View>
  );
}
