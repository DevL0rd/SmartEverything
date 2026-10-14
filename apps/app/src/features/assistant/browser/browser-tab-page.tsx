import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react';
import { type TextInput, View } from 'react-native';
import type { AiChatRow } from '@smarteverything/domain';
import { notify } from '../../../components/toast-store';
import { Text } from '../../../components/text';
import { IconButton } from '../../../components/icon-button';
import { BrowserSurfaceSlot } from './browser-surface-slot';
import type { BrowserHandle } from '../../../platform/browser-contract';
import { BrowserToolbar } from './browser-toolbar';
import { BrowserConsole } from './browser-console';
import { BrowserTools } from './browser-tools';
import { usePreviewDiagnostics } from './browser-diagnostics';
import { BrowserActionScope } from './browser-action-scope';
import { useRequestedBrowserAction } from './browser-requested-action';
import { browserTabOperation } from './browser-tab-operation';
import { shiftedTabs, type BrowserTab } from './browser-tab-state';
import type { BrowserTabs } from './browser-tabs';
import type { BrowserPublication } from './browser-selection';
import { BrowserBlankPage } from './browser-blank-page';
interface BrowserTabPageProps {
  readonly chat: AiChatRow;
  readonly tabs: BrowserTabs;
  readonly tab: BrowserTab;
  readonly selected: boolean;
  readonly visible: boolean;
  readonly publications: readonly BrowserPublication[];
  readonly available: (publication: BrowserPublication) => boolean;
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
        reloadBrowserTab(tabs, tab.id);
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
  const { chat, tabs, tab, selected, visible } = props;
  const { surfaceRef, controls } = useTabControls(tabs, tab);
  const addressRef = useRef<TextInput>(null);
  const [height, setHeight] = useState(0);
  const diagnostics = usePreviewDiagnostics(
    chat.id,
    chat.profile_id,
    tab.selection?.target ?? null,
    selected && visible,
  );
  useEffect(() => {
    if (selected && tab.phase === 'blank') addressRef.current?.focus();
  }, [selected, tab.phase]);
  useTabActions(props, addressRef);
  return (
    <>
      <TabChrome {...props} addressRef={addressRef} controls={controls} diagnostics={diagnostics} />
      <View
        className="min-h-0 flex-1 overflow-hidden"
        onLayout={(event) => {
          setHeight(event.nativeEvent.layout.height);
        }}
      >
        <View className="min-h-0 flex-1 overflow-hidden">
          {tab.selection !== null ? (
            <BrowserSurfaceSlot
              chatId={chat.id}
              key={tab.selection.target.id}
              target={tab.selection.target}
              ref={surfaceRef}
              visible={selected ? visible : false}
              onStatus={(status) => {
                tabs.status(tab.id, status);
              }}
            />
          ) : (
            <TabEmpty {...props} />
          )}
        </View>
        <BrowserConsole
          controller={diagnostics.controller}
          snapshot={diagnostics.snapshot}
          availableHeight={height}
        />
      </View>
    </>
  );
}
interface TabChromeProps extends BrowserTabPageProps {
  readonly addressRef: React.RefObject<TextInput | null>;
  readonly controls: BrowserHandle;
  readonly diagnostics: ReturnType<typeof usePreviewDiagnostics>;
}
function TabChrome(props: TabChromeProps): ReactNode {
  const { tab, tabs, addressRef, controls, diagnostics, onNew } = props;
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
          <TabTools
            tab={tab}
            tabs={tabs}
            diagnostics={diagnostics}
            controls={controls}
            onNew={onNew}
          />
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
function TabEmpty({ tab, tabs, publications, available }: BrowserTabPageProps): ReactNode {
  if (tab.phase === 'blank')
    return (
      <BrowserBlankPage
        publications={publications}
        available={available}
        onSelect={(publication) => {
          browserTabOperation(tabs.openPublication(publication, tab.id));
        }}
      />
    );
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
      browserTabOperation(tabs.close(tab.id));
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
  diagnostics,
  controls,
  onNew,
}: Pick<TabChromeProps, 'tab' | 'tabs' | 'diagnostics' | 'controls' | 'onNew'>): ReactNode {
  const ready = tab.phase === 'ready' || tab.phase === 'unavailable';
  const address = tab.selection?.kind === 'html' || tab.address === '' ? null : tab.address;
  return (
    <BrowserTools
      controller={diagnostics.controller}
      snapshot={diagnostics.snapshot}
      controls={controls}
      address={address}
      ready={ready}
      tabActions={[
        { label: 'New tab', icon: 'plus', onPress: onNew },
        {
          label: 'Close tab',
          icon: 'close',
          onPress: (): void => {
            browserTabOperation(tabs.close(tab.id));
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

function reloadBrowserTab(tabs: BrowserTabs, id: string): void {
  void tabs.reload(id).catch((error: unknown): void => {
    notify({
      message: error instanceof Error ? error.message : 'The browser page could not be reloaded.',
      error,
      tone: 'default',
    });
  });
}
