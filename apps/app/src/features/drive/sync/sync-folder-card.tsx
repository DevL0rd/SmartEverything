import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { DriveRoot } from '@smarteverything/domain';
import { updateDriveRoot } from '../../../api/drive';
import { href } from '../../../app-shell/hrefs';
import { Badge } from '../../../components/badge';
import { BottomSheet } from '../../../components/bottom-sheet';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Bars, type Bar } from '../../../components/charts';
import { IconWell } from '../../../components/icon-well';
import { EmptyState } from '../../../components/empty-state';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useMutationState } from '../../../store/mutation';
import { rootCardOf } from '../roots/root-card-model';
import { addRootHref } from '../settings/page-roots';
import { SyncStatusLine, useRootSyncLine } from '../roots/sync-status-line';
import { SyncClientRow } from './sync-client-row';
import { CHANGE_DAYS, folderSubtitleOf, syncableRootsOf, type SyncClientView } from './sync-model';

const BARS_HEIGHT = 28;

export const MAKE_SYNCED = 'Make a folder synced';

const SHEET_DETENTS = ['fit'] as const;

export interface SyncFolderCardProps {
  readonly root: DriveRoot;
  readonly clients: readonly SyncClientView[];
  readonly bars: readonly Bar[];
  readonly compact: boolean;
}

function changesOf(bars: readonly Bar[]): number {
  return bars.reduce((all, bar) => all + bar.value, 0);
}

function Heading({
  root,
  subtitle,
}: {
  readonly root: DriveRoot;
  readonly subtitle: string;
}): ReactNode {
  const glyph = rootCardOf(root, null, []).glyph;
  return (
    <Interactive
      href={href.driveRoot(root.id)}
      label={`Open ${root.label}`}
      className="min-h-touch-min min-w-0 flex-1 flex-row items-center gap-3"
    >
      <IconWell icon={glyph} colour="viz-2" />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text variant="title-3" numberOfLines={1} className="shrink">
            {root.label}
          </Text>
          <Badge label={root.scope === 'home' ? 'Shared' : 'Yours'} />
        </View>
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular">
          {subtitle}
        </Text>
      </View>
    </Interactive>
  );
}

function ChangeBars({ bars }: { readonly bars: readonly Bar[] }): ReactNode {
  return (
    <Bars
      bars={bars}
      colour="info"
      height={BARS_HEIGHT}
      label={`Changes per day for ${String(CHANGE_DAYS)} days, ${count(changesOf(bars))} in total`}
      formatValue={count}
    />
  );
}

function SettingsButton({ root }: { readonly root: DriveRoot }): ReactNode {
  return (
    <Button
      label="Folder settings"
      spoken={`Folder settings for ${root.label}`}
      icon="settings"
      variant="outlined"
      href={href.driveSyncFolder(root.id)}
    />
  );
}

function CompactSync({ root }: { readonly root: DriveRoot }): ReactNode {
  const line = useRootSyncLine(root);
  return line === null ? null : <SyncStatusLine line={line} />;
}

export function SyncFolderCard({ root, clients, bars, compact }: SyncFolderCardProps): ReactNode {
  const subtitle = folderSubtitleOf({
    root,
    changes: changesOf(bars),
    selective: clients.filter((client) => client.selective).length,
  });
  if (compact) {
    return (
      <Card>
        <Heading root={root} subtitle={subtitle} />
        <ChangeBars bars={bars} />
        <CompactSync root={root} />
        <SettingsButton root={root} />
      </Card>
    );
  }
  return (
    <Card padding="none" className="gap-0 overflow-hidden">
      <View className="gap-3 p-card-pad">
        <View className="flex-row items-center gap-4">
          <Heading root={root} subtitle={subtitle} />
          <View className="w-36 flex-none">
            <ChangeBars bars={bars} />
          </View>
          <SettingsButton root={root} />
        </View>
      </View>
      {clients.map((client) => (
        <View key={client.key} className="border-t-hairline border-outline-variant">
          <SyncClientRow view={client} />
        </View>
      ))}
    </Card>
  );
}

function NothingToSync(): ReactNode {
  return (
    <EmptyState
      compact
      icon="folderSync"
      title="Every folder is synced"
      body="Add another folder or drive to the library to sync it to your computers."
      action={
        <Button label="Add a folder or drive" variant="tonal" icon="plus" href={addRootHref()} />
      }
    />
  );
}

function SyncChoices({
  choices,
  close,
}: {
  readonly choices: readonly DriveRoot[];
  readonly close: () => void;
}): ReactNode {
  const router = useRouter();
  const mutation = useMutationState();
  return choices.map((root) => (
    <ListRow
      key={root.id}
      title={root.label}
      {...(root.path === null ? {} : { subtitle: root.path })}
      icon="folder"
      disabled={mutation.busy}
      label={`Sync ${root.label} to your computers`}
      onPress={() => {
        mutation.run(() => updateDriveRoot(root.id, { synced: true }), {
          failure: `${root.label} was not synced`,
          label: 'drive.sync.make_synced',
          onDone: () => {
            close();
            router.push(href.driveSyncFolder(root.id));
          },
        });
      }}
    />
  ));
}

export function MakeSyncedSheet({
  roots,
  close,
}: {
  readonly roots: readonly DriveRoot[];
  readonly close: () => void;
}): ReactNode {
  const choices = syncableRootsOf(roots);
  return (
    <BottomSheet
      open
      onClose={close}
      title={MAKE_SYNCED}
      label={MAKE_SYNCED}
      detents={SHEET_DETENTS}
    >
      {choices.length === 0 ? <NothingToSync /> : <SyncChoices choices={choices} close={close} />}
    </BottomSheet>
  );
}
