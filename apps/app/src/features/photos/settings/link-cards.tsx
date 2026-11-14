import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { ProgressBar, SegmentBar } from '../../../components/charts';
import { Icon, type IconName } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useBackupStatus } from '../backup/model/status';
import { useLiveProgress } from '../backup/live';
import { usePhotoBackupState, usePhotoDuplicateStats } from '../data';
import { sourceSegmentsOf } from '../duplicates/model';
import { useDriveLabels } from '../duplicates/use-drive-labels';
import { localMediaSource } from '../local/source';
import { PHOTOS_BACKUP_PAGE, PHOTOS_DUPLICATES_PAGE } from '../settings';
import { backupCardOf, duplicatesCardOf } from './model';

function CardHead({ icon, title }: { readonly icon: IconName; readonly title: string }): ReactNode {
  return (
    <View className="flex-row items-center gap-3">
      <View className="size-10 items-center justify-center rounded-full bg-primary-container">
        <Icon name={icon} size={20} tone="primary" />
      </View>
      <Text variant="body-strong" numberOfLines={1} className="min-w-0 flex-1">
        {title}
      </Text>
      <Icon name="chevronRight" size={20} tone="variant" />
    </View>
  );
}

function Lines({
  headline,
  detail,
}: {
  readonly headline: string | null;
  readonly detail: string | null;
}): ReactNode {
  if (headline === null) {
    return (
      <View aria-busy className="gap-2">
        <Skeleton shape="text" />
        <Skeleton shape="line" className="h-2" />
      </View>
    );
  }
  return (
    <View className="gap-1">
      <Text variant="title-3" numberOfLines={1} className="tabular-nums">
        {headline}
      </Text>
      {detail === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1} className="tabular-nums">
          {detail}
        </Text>
      )}
    </View>
  );
}

function LocalBackupLink(): ReactNode {
  const status = useBackupStatus();
  return <BackupLinkBody local={status} />;
}

function BackupLinkBody({
  local,
}: {
  readonly local: ReturnType<typeof useBackupStatus> | null;
}): ReactNode {
  const state = usePhotoBackupState().data;
  const view = backupCardOf({ status: local, state, live: useLiveProgress() });
  return (
    <Card href={href.settings.page(PHOTOS_BACKUP_PAGE)} label="Backup" className="min-w-0 flex-1">
      <CardHead icon="upload" title="Backup" />
      <Lines headline={view.headline} detail={view.headline === null ? null : view.detail} />
      {view.progress === null ? null : (
        <ProgressBar progress={view.progress} colour={view.colour} label="Backed up so far" />
      )}
    </Card>
  );
}

export function BackupLinkCard(): ReactNode {
  return localMediaSource() === null ? <BackupLinkBody local={null} /> : <LocalBackupLink />;
}

export function DuplicatesLinkCard(): ReactNode {
  const stats = usePhotoDuplicateStats().data;
  const labels = useDriveLabels();
  const view = stats === undefined ? null : duplicatesCardOf(stats);
  return (
    <Card
      href={href.settings.page(PHOTOS_DUPLICATES_PAGE)}
      label="Duplicates"
      className="min-w-0 flex-1"
    >
      <CardHead icon="copy" title="Duplicates" />
      <Lines headline={view?.headline ?? null} detail={view?.detail ?? null} />
      {stats === undefined || stats.groups === 0 ? null : (
        <SegmentBar
          segments={sourceSegmentsOf(stats, labels)}
          label={`Copies by drive, ${count(stats.extraCopies)} in all`}
          size="regular"
        />
      )}
    </Card>
  );
}
