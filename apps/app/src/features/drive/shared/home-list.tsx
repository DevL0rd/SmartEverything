import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveAlbum, DriveRoot } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import { Badge } from '../../../components/badge';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import type { IconName } from '../../../components/icon';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { useDriveSyncClients } from '../../nas/data';
import { DRIVE_SETTINGS_PAGE } from '../settings/sections';
import type { ShareOpener, ShareTarget } from './share-target';
import { albumLineOf, rootAccessOf, rootLineOf } from './shared-model';

const ROOT_ICON: Readonly<Record<DriveRoot['kind'], IconName>> = {
  folder: 'folder',
  volume: 'hardDrive',
  managed: 'server',
  cameras: 'camera',
  ai_images: 'sparkles',
};

export interface HomeListProps {
  readonly roots: readonly DriveRoot[];
  readonly albums: readonly DriveAlbum[];
  readonly openShare: ShareOpener | undefined;
  readonly compact: boolean;
}

function MakeLink({
  name,
  target,
  openShare,
  compact,
}: {
  readonly name: string;
  readonly target: ShareTarget;
  readonly openShare: ShareOpener | undefined;
  readonly compact: boolean;
}): ReactNode {
  if (openShare === undefined) return null;
  return (
    <Button
      label={compact ? 'Link' : 'Make a link'}
      spoken={`Make a link to ${name}`}
      icon="link"
      variant="tonal"
      onPress={() => {
        openShare(target);
      }}
    />
  );
}

function Trailing({
  access,
  link,
}: {
  readonly access: string | null;
  readonly link: ReactNode;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      {access === null ? null : <Badge label={access} />}
      {link}
    </View>
  );
}

function albumHrefOf(album: DriveAlbum): AppHref {
  return album.surface === 'photos' ? href.photosAlbum(album.id) : href.drivePage('starred');
}

function RootRows({ roots, openShare, compact }: Omit<HomeListProps, 'albums'>): ReactNode {
  const clients = useDriveSyncClients();
  return (
    <List title="Library folders everyone in the home can use">
      {roots.map((root) => (
        <ListRow
          key={root.id}
          title={root.label}
          icon={ROOT_ICON[root.kind]}
          iconTone="primary"
          subtitle={rootLineOf(root, clients)}
          href={href.driveRoot(root.id)}
          trailing={
            <Trailing
              access={compact ? null : rootAccessOf(root)}
              link={
                <MakeLink
                  name={root.label}
                  target={{ kind: 'root', rootId: root.id }}
                  openShare={openShare}
                  compact={compact}
                />
              }
            />
          }
        />
      ))}
    </List>
  );
}

function AlbumRows({ albums, openShare, compact }: Omit<HomeListProps, 'roots'>): ReactNode {
  return (
    <List title="Albums everyone in the home can see">
      {albums.map((album) => (
        <ListRow
          key={album.id}
          title={album.title}
          icon="image"
          subtitle={albumLineOf(album)}
          href={albumHrefOf(album)}
          trailing={
            <MakeLink
              name={album.title}
              target={{ kind: 'album', albumId: album.id }}
              openShare={openShare}
              compact={compact}
            />
          }
        />
      ))}
    </List>
  );
}

export function NothingShared(): ReactNode {
  return (
    <EmptyState
      icon="users"
      title="Nothing is shared with the home yet"
      body="Set a library folder or an album to Home and everyone in the home sees it."
      action={
        <Button
          label="Drive settings"
          icon="settings"
          variant="tonal"
          href={href.settings.focus(DRIVE_SETTINGS_PAGE, 'drive.roots')}
        />
      }
    />
  );
}

export function HomeList(props: HomeListProps): ReactNode {
  const { roots, albums } = props;
  if (roots.length === 0 && albums.length === 0) return <NothingShared />;
  return (
    <View className="gap-4">
      {roots.length === 0 ? null : <RootRows {...props} />}
      {albums.length === 0 ? null : <AlbumRows {...props} />}
      <Text variant="footnote" tone="variant" className="px-4">
        Everyone in the home sees these. Library folders and albums set to Only me stay private.
      </Text>
    </View>
  );
}
