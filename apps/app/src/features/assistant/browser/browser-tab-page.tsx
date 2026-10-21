import { useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import { type TextInput, View } from 'react-native';
import type { AiChatRow, BrowserTarget } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { IconButton } from '../../../components/icon-button';
import { BrowserSurfaceSlot } from './browser-surface-slot';
import type { BrowserHandle } from '../../../platform/browser-contract';
import { BrowserToolbar } from './browser-toolbar';
import { BrowserTools } from './browser-tools';
import { BrowserActionScope } from './browser-action-scope';
import { useRequestedBrowserAction } from './browser-requested-action';
import {
  announcedBrowserTabOperation,
  browserTabOperation,
  openBrowserAddress,
} from './browser-tab-operation';
import { shiftedTabs, type BrowserTab } from './browser-tab-state';
import type { BrowserTabs } from './browser-tabs';
import { BrowserBlankPage } from './browser-blank-page';
interface BrowserTabPageProps {
  readonly chat: AiChatRow;
  readonly tabs: BrowserTabs;
  readonly tab: BrowserTab;
  readonly selected: boolean;
  readonly visible: boolean;
  readonly onNew: () => void;
}
export function BrowserTabPage(props: BrowserTabPageProps): ReactNode {
  const { selected, visible } = props;
  const frame = selected ? { flex: 1 } : ({ position: 'absolute', inset: 0, opacity: 0 } as const);
  return (
    <View
      pointerEvents={selected ? 'auto' : 'none'}
      aria-hidden={!selected}
      accessibilityElementsHidden={!selected}
      importantForAccessibility={selected ? 'auto' : 'no-hide-descendants'}
      style={frame}
      className="min-h-0 min-w-0"
    >
      <BrowserActionScope value={selected ? visible : false}>
        <TabContent {...props} />
      </BrowserActionScope>
    </View>
  );
}
function useTabControls(
  tabs: BrowserTabs,
  tab: BrowserTab,
): {
  readonly surfaceRef: (handle: BrowserHandle | null) => void;
  readonly controls: BrowserHandle;
} {
  const nativeRef = useRef<BrowserHandle>(null);
  const surfaceRef = useCallback(
    (handle: BrowserHandle | null): void => {
      nativeRef.current = handle;
      tabs.attach(tab.id, handle);
    },
    [tabs, tab.id],
  );
  const controls: BrowserHandle = useMemo(
    () => ({
      navigate: (url): void => {
        localBrowserControl(nativeRef, (handle): void => {
          handle.navigate(url);
        });
      },
      back: (): void => {
        localBrowserControl(nativeRef, (handle): void => {
          handle.back();
        });
      },
      forward: (): void => {
        localBrowserControl(nativeRef, (handle): void => {
          handle.forward();
        });
      },
      reload: (): void => {
        browserTabOperation(tabs.reload(tab.id));
      },
      stop: (): void => {
        localBrowserControl(nativeRef, (handle): void => {
          handle.stop();
        });
      },
    }),
    [tab.id, tabs],
  );
  return { surfaceRef, controls };
}
function TabContent(props: BrowserTabPageProps): ReactNode {
  const { tabs, tab, selected } = props;
  const { surfaceRef, controls } = useTabControls(tabs, tab);
  const addressRef = useRef<TextInput>(null);
  useEffect(() => {
    if (selected && tab.phase === 'blank') addressRef.current?.focus();
  }, [selected, tab.phase]);
  useTabActions(props, addressRef);
  return (
    <>
      <TabChrome {...props} addressRef={addressRef} controls={controls} />
      <View className="min-h-0 flex-1 overflow-hidden">
        {tab.selection !== null ? (
          <TabSurface {...props} target={tab.selection.target} surfaceRef={surfaceRef} />
        ) : (
          <TabEmpty {...props} />
        )}
      </View>
    </>
  );
}
function TabSurface({
  chat,
  tabs,
  tab,
  selected,
  visible,
  target,
  surfaceRef,
}: BrowserTabPageProps & {
  readonly target: BrowserTarget;
  readonly surfaceRef: (handle: BrowserHandle | null) => void;
}): ReactNode {
  return (
    <BrowserSurfaceSlot
      chatId={chat.id}
      key={target.id}
      target={target}
      ref={surfaceRef}
      visible={selected ? visible : false}
      onStatus={(status) => {
        tabs.status(tab.id, status);
      }}
      onOpenWindow={(url) => {
        openBrowserAddress(tabs, url);
      }}
    />
  );
}
interface TabChromeProps extends BrowserTabPageProps {
  readonly addressRef: React.RefObject<TextInput | null>;
  readonly controls: BrowserHandle;
}
function TabChrome(props: TabChromeProps): ReactNode {
  const { tab, tabs, addressRef, controls, onNew } = props;
  const ready = tab.phase === 'ready' || tab.phase === 'unavailable';
  const problem = tab.problem ?? tab.status.problem;
  return (
    <>
      <BrowserToolbar
        address={tab.address}
        onAddress={(value) => {
          tabs.address(tab.id, value);
        }}
        onEditing={(value) => {
          tabs.editing(tab.id, value);
        }}
        navigate={() => {
          browserTabOperation(tabs.navigate(tab.id, tab.address));
        }}
        inputRef={addressRef}
        status={tab.status}
        controls={controls}
        ready={ready}
        tools={
          <TabTools tab={tab} tabs={tabs} controls={controls} onNew={onNew} />
        }
      />
      <View className={tab.status.loading ? 'h-0.5 bg-primary' : 'h-0.5 bg-outline-variant'} />
      {problem === null ? null : (
        <Text
          accessibilityLiveRegion="polite"
          variant="caption"
          tone="warning"
          className="px-3 py-2"
        >
          {problem}
        </Text>
      )}
    </>
  );
}
function TabEmpty({ tab, tabs }: BrowserTabPageProps): ReactNode {
  if (tab.phase === 'blank') return <BrowserBlankPage />;
  return (
    <View className="min-h-0 flex-1 items-center justify-center gap-2 px-6">
      <Text variant="title-3">{tab.phase === 'opening' ? 'Opening page…' : tab.title}</Text>
      <Text tone="variant" className="text-center">
        {tab.phase === 'opening' ? 'Waiting for its browser presentation.' : tab.problem}
      </Text>
      {tab.phase === 'unavailable' ? (
        <IconButton
          icon="refresh"
          label="Retry browser tab"
          onPress={() => {
            browserTabOperation(tabs.reload(tab.id));
          }}
        />
      ) : null}
    </View>
  );
}
function useTabActions(props: BrowserTabPageProps, input: React.RefObject<TextInput | null>): void {
  const { tabs, tab } = props;
  const move = (offset: -1 | 1): void => {
    tabs.reorder(
      shiftedTabs(
        tabs.read().tabs.map((entry) => entry.id),
        tab.id,
        offset,
      ),
    );
  };
  useRequestedBrowserAction({
    'new-tab': props.onNew,
    'close-tab': (): void => {
      announcedBrowserTabOperation(tabs.close(tab.id));
    },
    'tab-earlier': (): void => {
      move(-1);
    },
    'tab-later': (): void => {
      move(1);
    },
    address: (): void => {
      input.current?.focus();
    },
  });
}

function TabTools({
  tab,
  tabs,
  controls,
  onNew,
}: Pick<TabChromeProps, 'tab' | 'tabs' | 'controls' | 'onNew'>): ReactNode {
  const ready = tab.phase === 'ready' || tab.phase === 'unavailable';
  const address = tab.selection?.kind === 'project' || tab.address === '' ? null : tab.address;
  return (
    <BrowserTools
      controls={controls}
      address={address}
      ready={ready}
      tabActions={[
        { label: 'New tab', icon: 'plus', onPress: onNew },
        {
          label: 'Close tab',
          icon: 'close',
          onPress: (): void => {
            announcedBrowserTabOperation(tabs.close(tab.id));
          },
        },
      ]}
    />
  );
}

function localBrowserControl(
  ref: React.RefObject<BrowserHandle | null>,
  action: (handle: BrowserHandle) => void,
): void {
  const handle = ref.current;
  if (handle === null) {
    notify({ message: 'Wait for this browser page to finish opening.', tone: 'default' });
    return;
  }
  action(handle);
}
