import type { ReactNode } from 'react';
import { useState } from 'react';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { notify } from '../../../components/toast-store';
import { removeIrCode, removeIrRemote } from '../../../api/ir';
import { useDevice, useIrCodes, useIrRemotes } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { MissingDevice } from '../detail/missing-device';
import { useDisplayName } from '../model/display-name';
import { canLearn } from '../model/remote-layout';
import { AddRemoteSheet } from './add-remote-sheet';
import { LearnSheet } from './learn-sheet';
import { DeviceSettingsFrame } from './settings-frame';

function failed(what: string): (error: unknown) => void {
  return (error) => {
    notify({
      message: what,
      error,
      tone: 'critical',
    });
  };
}

function forgetCode(code: IrCodeRow): void {
  void confirm({
    title: `Forget ${code.button}?`,
    confirmLabel: 'Forget',
    tone: 'destructive',
  }).then((yes) => {
    if (yes) {
      removeIrCode(code.id).catch(failed(`${code.button} was not forgotten`));
    }
  });
}

function removeRemote(remote: IrRemoteRow): void {
  void confirm({
    title: `Remove ${remote.name}?`,
    body: 'Its learned buttons go with it.',
    confirmLabel: 'Remove',
    tone: 'destructive',
  }).then((yes) => {
    if (yes) {
      removeIrRemote(remote.id).catch(failed(`${remote.name} was not removed`));
    }
  });
}

function RemoteGroup({
  blaster,
  remote,
  onLearn,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
  readonly onLearn: () => void;
}): ReactNode {
  const codes = useIrCodes(remote.id);
  return (
    <List title={remote.brand === null ? remote.name : `${remote.name} · ${remote.brand}`}>
      {codes.map((code) => (
        <ListRow
          key={code.id}
          title={code.button}
          trailing={
            <IconButton
              icon="trash"
              label={`Forget ${code.button}`}
              onPress={() => {
                forgetCode(code);
              }}
            />
          }
        />
      ))}
      {canLearn(blaster.capabilities) ? (
        <ListRow title="Learn a button" icon="plus" onPress={onLearn} />
      ) : null}
      <ListRow
        title="Remove remote"
        icon="trash"
        destructive
        onPress={() => {
          removeRemote(remote);
        }}
      />
    </List>
  );
}

function Sheets({
  blaster,
  adding,
  learning,
  onClose,
}: {
  readonly blaster: Device;
  readonly adding: boolean;
  readonly learning: IrRemoteRow | null;
  readonly onClose: () => void;
}): ReactNode {
  if (adding) {
    return <AddRemoteSheet blaster={blaster} onClose={onClose} />;
  }
  return learning === null ? null : (
    <LearnSheet blaster={blaster} remote={learning} onClose={onClose} />
  );
}

function Body({ blaster }: { readonly blaster: Device }): ReactNode {
  const name = useDisplayName(blaster.id);
  const remotes = useIrRemotes(blaster.id);
  const [adding, setAdding] = useState(false);
  const [learning, setLearning] = useState<IrRemoteRow | null>(null);
  return (
    <DeviceSettingsFrame deviceId={blaster.id} name={name} title="Remotes">
      {remotes.length === 0 ? (
        <EmptyState
          icon="remote"
          title="No remotes yet"
          body="Add a remote, then teach it its buttons."
        />
      ) : null}
      {remotes.map((remote) => (
        <RemoteGroup
          key={remote.id}
          blaster={blaster}
          remote={remote}
          onLearn={() => {
            setLearning(remote);
          }}
        />
      ))}
      <List>
        <ListRow
          title="Add a remote"
          icon="plus"
          onPress={() => {
            setAdding(true);
          }}
        />
      </List>
      <Sheets
        blaster={blaster}
        adding={adding}
        learning={learning}
        onClose={() => {
          setAdding(false);
          setLearning(null);
        }}
      />
    </DeviceSettingsFrame>
  );
}

export function DeviceRemotesScreen({ deviceId }: { readonly deviceId: string }): ReactNode {
  const device = useDevice(deviceId);
  return device === null ? <MissingDevice /> : <Body blaster={device} />;
}
