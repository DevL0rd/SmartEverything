import type { ReactNode } from 'react';
import { useState } from 'react';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { confirm } from '../../../components/confirm-store';
import { EmptyState } from '../../../components/empty-state';
import { IconButton } from '../../../components/icon-button';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { notifyFailure } from '../../../components/toast-store';
import { removeIrCode, removeIrRemote } from '../../../api/ir';
import { useDevice, useIrCodes, useIrRemotes } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { MissingDevice } from '../detail/missing-device';
import { useDisplayName } from '../model/display-name';
import { canLearn } from '../model/remote-layout';
import { AddRemoteSheet } from './add-remote-sheet';
import { LearnSheet } from './learn-sheet';
import { DeviceSettingsFrame } from './settings-frame';

const log = new Logger('app.devices');

function forgetCode(code: IrCodeRow): void {
  background(
    confirm({
      title: `Forget ${code.button}?`,
      confirmLabel: 'Forget',
      tone: 'destructive',
    }).then((yes) => {
      log.info('remote.forget_confirmed', { codeId: code.id, confirmed: yes });
      if (yes) {
        const fail = notifyFailure(`${code.button} was not forgotten`);
        removeIrCode(code.id).catch((error: unknown) => {
          log.error('remote.forget_failed', error, { codeId: code.id });
          fail(error);
        });
      }
    }),
    'remotes_screen.confirm_failed',
  );
}

function removeRemote(remote: IrRemoteRow): void {
  background(
    confirm({
      title: `Remove ${remote.name}?`,
      body: 'Its learned buttons go with it.',
      confirmLabel: 'Remove',
      tone: 'destructive',
    }).then((yes) => {
      log.info('remote.remove_confirmed', { remoteId: remote.id, confirmed: yes });
      if (yes) {
        const fail = notifyFailure(`${remote.name} was not removed`);
        removeIrRemote(remote.id).catch((error: unknown) => {
          log.error('remote.remove_failed', error, { remoteId: remote.id });
          fail(error);
        });
      }
    }),
    'remotes_screen.confirm_failed',
  );
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
