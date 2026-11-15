import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import type { FileLocation } from '../source/types';
import type { FileBrowserHandle } from './browser-types';
import { emptyCopyOf, type BodyState } from './view-state-model';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export function BrowserLoading({ label }: { readonly label: string }): ReactNode {
  return (
    <View className="gap-3 p-4" accessibilityLabel={label}>
      {SKELETON_ROWS.map((slot) => (
        <Skeleton key={slot} shape="line" className="h-10" />
      ))}
    </View>
  );
}

function upOf<O>(browser: FileBrowserHandle<O>): FileLocation | null {
  return browser.listing.crumbs.at(-2)?.location ?? browser.places[0]?.location ?? null;
}

const OFFLINE_LINE = 'You’re offline. These are the files from the last visit.';

export function offlineLineOf<O>(browser: FileBrowserHandle<O>): string {
  return browser.host.offlineLine ?? OFFLINE_LINE;
}

function offlineEmptyLineOf<O>(browser: FileBrowserHandle<O>): string {
  return browser.host.offlineEmptyLine ?? offlineLineOf(browser);
}

export function OfflineLine<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  if (!browser.offline || browser.body.kind !== 'entries') return null;
  return (
    <View className="flex-row items-center gap-2 border-b border-outline-variant px-4 py-2">
      <Icon name="wifiOff" size={16} tone="variant" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {offlineLineOf(browser)}
      </Text>
    </View>
  );
}

function AreaButtons<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { primary, actions } = browser.header;
  if (primary === undefined && actions.length === 0) return null;
  return (
    <View className="flex-row flex-wrap justify-center gap-2">
      {primary === undefined ? null : (
        <Button label={primary.label} icon={primary.icon} onPress={primary.onPress} />
      )}
      {actions.map((action) => (
        <Button
          key={action.label}
          label={action.label}
          icon={action.icon}
          variant="tonal"
          {...(action.onPress === undefined ? {} : { onPress: action.onPress })}
        />
      ))}
    </View>
  );
}

function Denied<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const up = upOf(browser);
  return (
    <EmptyState
      icon="lock"
      title="You can’t open this folder"
      body="It is private, or it was moved or removed."
      {...(up === null
        ? {}
        : {
            action: (
              <Button
                label="Go up"
                icon="arrowUp"
                variant="tonal"
                onPress={() => {
                  browser.commands.openLocation(up);
                }}
              />
            ),
          })}
    />
  );
}

function Empty<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const copy = emptyCopyOf(browser.inTrash, browser.writable, browser.hiddenOnly);
  const showHidden = (): void => {
    browser.dispatch({ kind: 'showHidden', show: true });
  };
  return (
    <EmptyState
      icon={browser.inTrash ? 'trash' : 'folder'}
      title={copy.title}
      body={copy.body}
      action={
        browser.hiddenOnly ? (
          <Button label="Show hidden items" icon="eye" variant="tonal" onPress={showHidden} />
        ) : (
          <AreaButtons browser={browser} />
        )
      }
    />
  );
}

function NoMatch<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { filter } = browser;
  return (
    <EmptyState
      icon="filter"
      title={`Nothing matches ‘${filter.text.trim()}’`}
      body={filter.statusLine ?? 'Try fewer or other words.'}
      action={
        <View className="flex-row flex-wrap justify-center gap-2">
          <Button
            label="Clear the filter"
            icon="close"
            variant="tonal"
            onPress={() => {
              filter.setText('');
            }}
          />
          {filter.more !== null && filter.search === 'more' ? (
            <Button label="Find more matches" variant="text" onPress={filter.more} />
          ) : null}
        </View>
      }
    />
  );
}

function Searching<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const { filter } = browser;
  const { stop } = filter;
  return (
    <EmptyState
      icon="search"
      title={filter.statusLine ?? 'Looking…'}
      body={filter.scannedLine ?? 'Matches show here as they are found.'}
      {...(stop === null
        ? {}
        : { action: <Button label="Stop" icon="square" variant="tonal" onPress={stop} /> })}
    />
  );
}

function KindEmpty<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  return (
    <EmptyState
      icon="folder"
      title="Nothing of this kind here"
      body="Pick another kind to see the rest of this folder."
      action={
        <Button
          label="Show everything"
          variant="tonal"
          onPress={() => {
            browser.dispatch({ kind: 'filter', change: { kind: 'all' } });
          }}
        />
      }
    />
  );
}

const REFUSED_LINE = 'Ask the owner to share these files with you.';

function Refused<O>({ browser }: { readonly browser: FileBrowserHandle<O> }): ReactNode {
  const action = browser.host.refusedAction;
  return (
    <EmptyState
      icon="lock"
      title="You can’t see these files"
      body={browser.host.refusedLine ?? REFUSED_LINE}
      {...(action === undefined
        ? {}
        : { action: <Button label={action.label} variant="tonal" href={action.href} /> })}
    />
  );
}

function Fixed<O>({
  browser,
  state,
}: {
  readonly browser: FileBrowserHandle<O>;
  readonly state: Exclude<BodyState, { readonly kind: 'entries' | 'failed' }>;
}): ReactNode {
  switch (state.kind) {
    case 'refused':
      return <Refused browser={browser} />;
    case 'loading':
      return <BrowserLoading label={`Reading ${browser.header.title}`} />;
    case 'offline':
      return <EmptyState icon="wifiOff" title="Offline" body={offlineEmptyLineOf(browser)} />;
    case 'denied':
      return <Denied browser={browser} />;
    case 'empty':
      return <Empty browser={browser} />;
    case 'kindEmpty':
      return <KindEmpty browser={browser} />;
    case 'searching':
      return <Searching browser={browser} />;
    case 'noMatch':
      return <NoMatch browser={browser} />;
  }
}

export function BrowserBodyState<O>({
  browser,
}: {
  readonly browser: FileBrowserHandle<O>;
}): ReactNode {
  const state = browser.body;
  if (state.kind === 'entries') return null;
  if (state.kind === 'failed') {
    return <ErrorState error={state.error} retry={browser.listing.retry} />;
  }
  return <Fixed browser={browser} state={state} />;
}
