import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { IrRemoteRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { href } from '../../../app-shell/hrefs';
import { useControl } from '../../../store/control';
import { rowsOf, type Device } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { ControlBlock } from '../controls/control-block';
import { Guard, offlineReason } from '../controls/guard';
import { useDeviceModel } from '../model/device-model';
import { useDisplayName } from '../model/display-name';
import { remoteKeysOf } from '../model/remote-layout';
import { KeyGrid } from './key-grid';
import { RemoteExtras } from './remote-extras';
import { RemoteFace } from './remote-face';
import { RemotePad } from './remote-pad';
import { useLearnedSource, useDeviceRemoteSource, type RemoteSource } from './remote-source';
import { SceneSheet } from './scene-sheet';
import { useRemoteSend } from './use-remote-send';

interface Remotes {
  readonly blaster: Device | null;
  readonly remotes: readonly IrRemoteRow[];
}

function sameRemotes(left: Remotes, right: Remotes): boolean {
  return left.blaster === right.blaster && shallowEqual(left.remotes, right.remotes);
}

export function useRemotes(device: Device): Remotes {
  return useStoreSelector(
    (state): Remotes => ({
      blaster: device.kind === 'ir_blaster' ? device : null,
      remotes:
        device.kind === 'ir_blaster'
          ? rowsOf(state.tables.ir_remotes).filter((remote) => remote.blaster_id === device.id)
          : [],
    }),
    sameRemotes,
    [device],
  );
}

function RemotePanel({
  source,
  children,
}: {
  readonly source: RemoteSource;
  readonly children?: ReactNode;
}): ReactNode {
  const send = useRemoteSend(source);
  return (
    <Card>
      <View className="gap-4">
        <RemoteFace source={source} cls="l" />
        <RemoteExtras source={source} />
        {children}
        <KeyGrid source={source} press={send.press} />
      </View>
    </Card>
  );
}

function LearnedRemote({
  blaster,
  remote,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
}): ReactNode {
  return <RemotePanel source={useLearnedSource(blaster, remote)} />;
}

function MediaKeys({
  device,
  reason,
}: {
  readonly device: Device;
  readonly reason: string | null;
}): ReactNode {
  const model = useDeviceModel(device);
  const keys = model.presentation.capabilities.filter(
    (presented) =>
      presented.tier === 'control' &&
      presented.group === 'media' &&
      presented.writable &&
      presented.capability.value.kind === 'action',
  );
  if (keys.length === 0) {
    return null;
  }
  return (
    <View className="w-full flex-row flex-wrap justify-center gap-2">
      {keys.map((presented) => (
        <ControlBlock key={presented.key} device={device} presented={presented} reason={reason} />
      ))}
    </View>
  );
}

function PlainPad({
  device,
  reason,
}: {
  readonly device: Device;
  readonly reason: string | null;
}): ReactNode {
  const control = useControl(device.id, 'remote_key');
  return (
    <Card>
      <View className="gap-6">
        <Guard reason={reason}>
          <RemotePad
            device={device}
            press={(key) => {
              background(control.set(key), 'control.set_failed');
            }}
          />
        </Guard>
        <MediaKeys device={device} reason={reason} />
      </View>
    </Card>
  );
}

function DeviceRemote({ device }: { readonly device: Device }): ReactNode {
  const source = useDeviceRemoteSource(device);
  const send = useRemoteSend(source);
  const name = useDisplayName(device.id);
  const reason = device.online ? null : offlineReason(name);
  return (
    <RemotePanel source={source}>
      <Guard reason={reason}>
        <RemotePad device={device} press={send.press} />
      </Guard>
    </RemotePanel>
  );
}

function BlasterRemotes({
  blaster,
  remotes,
}: {
  readonly blaster: Device;
  readonly remotes: readonly IrRemoteRow[];
}): ReactNode {
  const [scene, setScene] = useState(false);
  const settings = href.settings.device(blaster.id, 'remotes');
  return (
    <>
      {remotes.map((remote) => (
        <LearnedRemote key={remote.id} blaster={blaster} remote={remote} />
      ))}
      {remotes.length === 0 ? (
        <EmptyState
          icon="remote"
          title="No remotes yet"
          body="Teach this blaster the buttons of a remote."
          action={<Button label="Learn a button" href={settings} />}
        />
      ) : (
        <View className="flex-row flex-wrap gap-2">
          <Button label="Add a remote" icon="plus" variant="tonal" href={settings} />
          <Button
            label="Make a scene"
            icon="film"
            variant="tonal"
            onPress={() => {
              setScene(true);
            }}
          />
        </View>
      )}
      {scene ? (
        <SceneSheet
          blaster={blaster}
          onClose={() => {
            setScene(false);
          }}
        />
      ) : null}
    </>
  );
}

export function RemoteSection({ device }: { readonly device: Device }): ReactNode {
  const { blaster, remotes } = useRemotes(device);
  const name = useDisplayName(device.id);
  const reason = device.online ? null : offlineReason(name);
  const own = device.kind === 'ir_remote';
  return (
    <View className="gap-section-gap">
      {own ? <DeviceRemote device={device} /> : null}
      {!own && remoteKeysOf(device.capabilities).length > 0 ? (
        <PlainPad device={device} reason={reason} />
      ) : null}
      {blaster === null ? null : <BlasterRemotes blaster={blaster} remotes={remotes} />}
    </View>
  );
}

const IR_KINDS: ReadonlySet<Device['kind']> = new Set(['ir_blaster', 'ir_remote']);

export function hasRemote(device: Device): boolean {
  return (
    device.kind !== 'television' &&
    (remoteKeysOf(device.capabilities).length > 0 || IR_KINDS.has(device.kind))
  );
}
