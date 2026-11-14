import { useState, type ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { SourceSearch } from '../../../api/photos';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { useMediaSelection } from '../../../components/media-grid/selection';
import type { MediaGrouping, MediaTile } from '../../../components/media-grid/tiles';
import { useDeviceTiles } from '../local/tiles';
import { useLocalLibrary, type LocalLibraryView } from '../local/use-local-library';
import { removeLastOf } from '../search/library-search';
import { isSearching } from '../search/query';
import { NoResults } from '../search/no-results';
import { DeviceSelection } from './device-selection';
import { LibraryGrid } from './library-grid';
import { LibraryShell, type LibraryHeadProps, type ZoomControl } from './library-head';
import { LibraryLoading } from './library-states';
import { loadedLineOf, TAB_EMPTY } from './library-tabs-view';
import { deviceViewOf, type DeviceView } from './local-scope';
import { ResultLine } from './result-line';
import { useClearOnChange } from './use-clear-on-change';
import { useMediaActions } from './use-media-actions';

export interface DeviceTabProps {
  readonly head: LibraryHeadProps;
  readonly search: SourceSearch;
  readonly zoom: ZoomControl;
  readonly grouping: MediaGrouping;
}

function ActionRow({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="flex-row">{children}</View>;
}

function WideCard({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="pt-4">
      <Card className="w-full">{children}</Card>
    </View>
  );
}

function AccessCard({
  library,
  onAsked,
}: {
  readonly library: LocalLibraryView;
  readonly onAsked: () => void;
}): ReactNode {
  return (
    <WideCard>
      <EmptyState
        compact
        icon="image"
        title="Show photos and videos on this device"
        body="Allow access to browse this device’s photos and videos here. This does not turn on backup."
        action={
          <ActionRow>
            <Button
              label="Allow access"
              variant="tonal"
              onPress={() => {
                background(library.requestAccess().then(onAsked), 'photos.device.access_failed');
              }}
            />
          </ActionRow>
        }
      />
    </WideCard>
  );
}

function SettingsCard(): ReactNode {
  return (
    <WideCard>
      <EmptyState
        compact
        icon="lock"
        title="Photo access is off"
        body="Turn on photo and video access for SmartEverything in the system settings to see this device’s library."
        action={
          <ActionRow>
            <Button
              label="Open system settings"
              variant="tonal"
              onPress={() => {
                background(Linking.openSettings(), 'photos.device.settings_failed');
              }}
            />
          </ActionRow>
        }
      />
    </WideCard>
  );
}

function StateCard({
  view,
  library,
  onAsked,
}: {
  readonly view: Exclude<DeviceView, { readonly kind: 'ready' }>;
  readonly library: LocalLibraryView;
  readonly onAsked: () => void;
}): ReactNode {
  if (view.kind === 'loading') return <LibraryLoading />;
  if (view.kind === 'ask') return <AccessCard library={library} onAsked={onAsked} />;
  if (view.kind === 'settings') return <SettingsCard />;
  if (view.kind === 'error') {
    return (
      <WideCard>
        <EmptyState
          compact
          icon="warning"
          title="Photos on this device did not load"
          body={view.message}
          action={
            <ActionRow>
              <Button
                label="Try again"
                variant="tonal"
                onPress={() => {
                  library.retry();
                }}
              />
            </ActionRow>
          }
        />
      </WideCard>
    );
  }
  const empty = TAB_EMPTY.device;
  return (
    <WideCard>
      <EmptyState compact icon={empty.icon} title={empty.title} body={empty.body} />
    </WideCard>
  );
}

function ReadyNotes({
  view,
  library,
}: {
  readonly view: Extract<DeviceView, { readonly kind: 'ready' }>;
  readonly library: LocalLibraryView;
}): ReactNode {
  return (
    <>
      {view.limited ? (
        <Banner
          tone="info"
          title="Showing the photos and videos you chose"
          body="Choose more to see them here. Backup is optional."
          wrapBody
          action={{
            label: 'Choose more',
            onPress: () => {
              background(library.requestAccess(), 'photos.device.access_failed');
            },
          }}
        />
      ) : null}
      {view.issue === null ? null : (
        <Banner
          tone="warning"
          title="Some photos on this device did not load"
          body={view.issue}
          wrapBody
          action={{
            label: 'Try again',
            onPress: () => {
              library.retry();
            },
          }}
        />
      )}
    </>
  );
}

interface GridProps {
  readonly page: DeviceTabProps;
  readonly tiles: readonly MediaTile[];
  readonly controls: ReturnType<typeof useMediaSelection>;
}

function DeviceGrid({ page, tiles, controls }: GridProps): ReactNode {
  const { search } = page.head;
  const media = useMediaActions();
  const searching = isSearching(search.input);
  return (
    <View className="-mx-gutter min-h-0 flex-1">
      {searching && tiles.length > 0 ? (
        <ResultLine
          text={loadedLineOf(tiles.length, true)}
          search={null}
          onClear={() => {
            search.act({ type: 'clear' });
          }}
        />
      ) : null}
      <LibraryGrid
        tiles={tiles}
        step={page.zoom.step}
        onStep={page.zoom.onStep}
        grouping={page.grouping}
        selection={controls}
        media={media}
        empty={<NoResults search={search.input} onRemoveLast={removeLastOf(search)} />}
        footer={<View />}
        onEnd={() => undefined}
      />
    </View>
  );
}

export function DeviceTab(props: DeviceTabProps): ReactNode {
  const library = useLocalLibrary();
  const [asked, setAsked] = useState(false);
  const view = deviceViewOf(library, asked);
  const tiles = useDeviceTiles(props.search);
  const controls = useMediaSelection(tiles.map((tile) => tile.id));
  useClearOnChange(JSON.stringify(props.search), controls.clear);
  const ready = view.kind === 'ready';
  return (
    <LibraryShell
      head={props.head}
      frame={{
        subtitle: ready ? `${loadedLineOf(library.items.length, true)} on this device` : null,
        actions: ready
          ? [{ icon: 'circleCheck', label: 'Select', iconOnly: true, onPress: controls.begin }]
          : [],
        selection: controls.selection.active ? (
          <DeviceSelection controls={controls} items={library.items} />
        ) : null,
        banner: null,
      }}
    >
      {view.kind === 'ready' ? (
        <>
          <ReadyNotes view={view} library={library} />
          <DeviceGrid page={props} tiles={tiles} controls={controls} />
        </>
      ) : (
        <StateCard
          view={view}
          library={library}
          onAsked={() => {
            setAsked(true);
          }}
        />
      )}
    </LibraryShell>
  );
}
