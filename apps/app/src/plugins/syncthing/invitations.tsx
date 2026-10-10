import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { ListRow } from '../../components/list-row';
import { List } from '../../components/section';
import { joinParts } from '../../format/text';
import { useSyncthingTools } from './syncthing-data';

type PendingDevice = SyncthingSnapshot['pendingDevices'][number];
type PendingFolder = SyncthingSnapshot['pendingFolders'][number];

function Answer({
  accept,
  ignore,
}: {
  readonly accept: () => void;
  readonly ignore: () => void;
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      <Button label="Accept" variant="tonal" onPress={accept} />
      <Button label="Ignore" variant="text" onPress={ignore} />
    </View>
  );
}

function DeviceInvite({ invite }: { readonly invite: PendingDevice }): ReactNode {
  const tools = useSyncthingTools();
  return (
    <ListRow
      title={invite.name}
      subtitle={joinParts(['Wants to connect', invite.address])}
      icon="link"
      trailing={
        <Answer
          accept={() =>
            void tools.run('accept_invite', {
              invite: { command: 'accept_device', deviceId: invite.id, name: invite.name },
            })
          }
          ignore={() =>
            void tools.run('ignore_invite', {
              invite: { command: 'ignore_device', deviceId: invite.id },
            })
          }
        />
      }
    />
  );
}

function FolderInvite({ invite }: { readonly invite: PendingFolder }): ReactNode {
  const tools = useSyncthingTools();
  return (
    <ListRow
      title={invite.label}
      subtitle={`Offered by ${invite.offeredBy.map((by) => by.name).join(', ')}`}
      icon="folder"
      trailing={
        <Answer
          accept={() =>
            void tools.run('accept_invite', {
              invite: { command: 'accept_folder', folderId: invite.id, path: null },
            })
          }
          ignore={() =>
            void tools.run('ignore_invite', {
              invite: { command: 'ignore_folder', folderId: invite.id },
            })
          }
        />
      }
    />
  );
}

export function Invitations({ snapshot }: { readonly snapshot: SyncthingSnapshot }): ReactNode {
  if (snapshot.pendingDevices.length + snapshot.pendingFolders.length === 0) {
    return null;
  }
  return (
    <List title="Invitations" footer="Accepted folders go to Syncthing’s default folder location.">
      {snapshot.pendingDevices.map((invite) => (
        <DeviceInvite key={invite.id} invite={invite} />
      ))}
      {snapshot.pendingFolders.map((invite) => (
        <FolderInvite key={invite.id} invite={invite} />
      ))}
    </List>
  );
}
