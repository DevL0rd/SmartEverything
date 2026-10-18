import type { SyncthingSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Section } from '../../components/section';
import { notify } from '../../components/toast-store';
import { joinParts } from '../../format/text';
import { relative } from '../../format/time';
import { useMinute } from '../../store/clock';
import { InviteCard } from '../shared/invite-card';
import { useSyncthingTools } from './syncthing-data';

type PendingDevice = SyncthingSnapshot['pendingDevices'][number];
type PendingFolder = SyncthingSnapshot['pendingFolders'][number];

function useAnswer(): (
  tool: 'accept_invite' | 'ignore_invite',
  invite: Readonly<Record<string, unknown>>,
  failure: string,
  done: string | null,
) => Promise<unknown> {
  const tools = useSyncthingTools();
  return async (tool, invite, failure, done) => {
    const result = await tools.run(tool, { invite }, failure);
    if (result !== null && done !== null) {
      notify({ message: done });
    }
  };
}

function DeviceInvite({
  invite,
  now,
}: {
  readonly invite: PendingDevice;
  readonly now: number;
}): ReactNode {
  const answer = useAnswer();
  return (
    <InviteCard
      icon="link"
      title={`${invite.name} wants to connect`}
      detail={joinParts([invite.address, relative(invite.at, now)])}
      accept={{
        onPress: () =>
          answer(
            'accept_invite',
            { command: 'accept_device', deviceId: invite.id, name: invite.name },
            `${invite.name} wasn’t accepted`,
            `${invite.name} connected`,
          ),
      }}
      ignore={{
        onPress: () =>
          answer(
            'ignore_invite',
            { command: 'ignore_device', deviceId: invite.id },
            `${invite.name} wasn’t ignored`,
            null,
          ),
      }}
    />
  );
}

function offeredAt(invite: PendingFolder): Date | null {
  const latest = Math.max(...invite.offeredBy.map((by) => Date.parse(by.at)));
  return Number.isFinite(latest) ? new Date(latest) : null;
}

function FolderInvite({
  invite,
  now,
}: {
  readonly invite: PendingFolder;
  readonly now: number;
}): ReactNode {
  const answer = useAnswer();
  const by = invite.offeredBy.map((offer) => offer.name).join(', ');
  const at = offeredAt(invite);
  return (
    <InviteCard
      icon="folder"
      title={by === '' ? invite.label : `${invite.label} · offered by ${by}`}
      detail={at === null ? 'Offered by another device' : `Offered ${relative(at, now)}`}
      accept={{
        onPress: () =>
          answer(
            'accept_invite',
            { command: 'accept_folder', folderId: invite.id, path: null },
            `${invite.label} wasn’t accepted`,
            `${invite.label} added`,
          ),
      }}
      ignore={{
        onPress: () =>
          answer(
            'ignore_invite',
            { command: 'ignore_folder', folderId: invite.id },
            `${invite.label} wasn’t ignored`,
            null,
          ),
      }}
    />
  );
}

export function Invitations({ snapshot }: { readonly snapshot: SyncthingSnapshot }): ReactNode {
  const now = useMinute();
  const total = snapshot.pendingDevices.length + snapshot.pendingFolders.length;
  if (total === 0) {
    return null;
  }
  return (
    <Section
      title="Invitations"
      caption={String(total)}
      {...(snapshot.pendingFolders.length === 0
        ? {}
        : { footer: 'Accepted folders go to Syncthing’s default folder location.' })}
    >
      <View className="gap-3">
        {snapshot.pendingDevices.map((invite) => (
          <DeviceInvite key={invite.id} invite={invite} now={now} />
        ))}
        {snapshot.pendingFolders.map((invite) => (
          <FolderInvite key={invite.id} invite={invite} now={now} />
        ))}
      </View>
    </Section>
  );
}
