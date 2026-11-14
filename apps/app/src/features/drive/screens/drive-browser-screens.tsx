import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { useLoaded } from '../../../store/selectors';
import { useDriveItem, useMyDrive, useSharedDrive } from '../data';
import { DriveFrame } from '../components/drive-frame';
import { FolderScreen } from '../folder/folder-screen';
import { HeroSkeleton } from '../home/drive-hero';
import type { DriveSection } from '../model/section-routes';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

function BrowserLoading({
  section,
  title,
}: {
  readonly section: DriveSection;
  readonly title: string;
}): ReactNode {
  return (
    <DriveFrame section={section} title={title}>
      <View aria-busy className="gap-3">
        <HeroSkeleton />
        {SKELETON_ROWS.map((key) => (
          <Skeleton key={key} className="h-row-h" />
        ))}
      </View>
    </DriveFrame>
  );
}

function NotReady({
  section,
  title,
  icon,
  action,
}: {
  readonly section: DriveSection;
  readonly title: string;
  readonly icon: 'hardDrive' | 'users';
  readonly action: ReactNode;
}): ReactNode {
  return (
    <DriveFrame section={section} title={title}>
      <EmptyState
        icon={icon}
        title={`${title} is not ready`}
        body="The hub makes it when it starts. It shows here as soon as the hub reports it."
        action={action}
      />
    </DriveFrame>
  );
}

export function MyDriveScreen(): ReactNode {
  const loaded = useLoaded();
  const mine = useMyDrive();
  if (mine !== null) return <FolderScreen rootId={mine.id} folderId={null} />;
  if (!loaded) return <BrowserLoading section="index" title="My Drive" />;
  return (
    <NotReady
      section="index"
      title="My Drive"
      icon="hardDrive"
      action={
        <Button
          label="Open the Shared Drive"
          variant="tonal"
          href={href.drivePage('shared-drive')}
        />
      }
    />
  );
}

export function SharedDriveScreen(): ReactNode {
  const loaded = useLoaded();
  const shared = useSharedDrive();
  if (shared !== null) return <FolderScreen rootId={shared.id} folderId={null} />;
  if (!loaded) return <BrowserLoading section="shared-drive" title="Shared Drive" />;
  return (
    <NotReady
      section="shared-drive"
      title="Shared Drive"
      icon="users"
      action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
    />
  );
}

export function DriveFolderScreen(): ReactNode {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  const folder = useDriveItem(folderId, null);
  if (folder.data?.kind === 'folder') {
    return <FolderScreen rootId={folder.data.rootId} folderId={folder.data.id} />;
  }
  if (folder.isPending) return <BrowserLoading section="index" title="Folder" />;
  return (
    <DriveFrame section="index" title="Folder">
      <EmptyState
        icon="folder"
        title="This folder is not available"
        body="It was moved to the trash, or it is no longer shared with you."
        action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
      />
    </DriveFrame>
  );
}
