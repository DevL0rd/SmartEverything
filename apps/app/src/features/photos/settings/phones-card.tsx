import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { BackupState } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { shortDate } from '../../../format/time';
import { usePhotoBackupState } from '../data/queries';
import { PERSON_FOLDER_TEMPLATE, folderOf, phoneBadge, phoneConditions } from './model';

const FOOTER = 'Each device turns its own backup on in Photos settings on that device.';

function PhoneRow({ state }: { readonly state: BackupState }): ReactNode {
  const badge = phoneBadge(state);
  return (
    <ListRow
      title={state.device.name}
      icon={state.device.platform === 'desktop' ? 'monitor' : 'smartphone'}
      subtitle={phoneConditions(state.device.settings, state.device.platform)}
      {...(state.lastBackupAt === null
        ? {}
        : { caption: `Last backed up ${shortDate(state.lastBackupAt)}` })}
      trailing={<Badge label={badge.label} tone={badge.tone} />}
    />
  );
}

function FolderRow({ folder }: { readonly folder: string }): ReactNode {
  return <ListRow title="Backup folder" icon="folder" subtitle={folder} wrapSubtitle />;
}

function NoPhones(): ReactNode {
  return (
    <View className="px-2 py-2">
      <EmptyState
        compact
        icon="smartphone"
        title="No devices back up yet"
        body="Open Photos settings on your phone or computer and turn on Back up this device."
      />
    </View>
  );
}

function Waiting(): ReactNode {
  return (
    <View className="px-4 py-3">
      <Skeleton shape="line" className="h-10" />
    </View>
  );
}

function phoneRows(states: readonly BackupState[] | undefined, failed: boolean): ReactNode {
  if (states === undefined) return failed ? null : <Waiting />;
  if (states.length === 0) return <NoPhones />;
  return states.map((state) => <PhoneRow key={state.device.id} state={state} />);
}

export function PhonesCard(): ReactNode {
  const backup = usePhotoBackupState();
  const states = backup.data;
  return (
    <List title="Backup" footer={FOOTER} inset>
      {phoneRows(states, backup.isError)}
      {backup.isError ? (
        <View className="px-4">
          <ErrorState
            error={backup.error}
            retry={() => {
              background(backup.refetch(), 'photos_settings.phones_refetch_failed');
            }}
          />
        </View>
      ) : null}
      <FolderRow folder={states === undefined ? PERSON_FOLDER_TEMPLATE : folderOf(states)} />
    </List>
  );
}
