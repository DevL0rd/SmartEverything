import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { IrRemoteRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { href } from '../../../app-shell/hrefs';
import { useControl } from '../../../store/control';
import { devicesIn } from '../../../store/selectors';
import { rowsOf, type Device } from '../../../store/state';
import { shallowEqual, useStoreSelector } from '../../../store/store-context';
import { ControlBlock } from '../controls/control-block';
import { Guard, offlineReason } from '../controls/guard';
import { useDeviceModel } from '../model/device-model';
import { useDisplayName } from '../model/display-name';
import { blasterOf, remotesShownOn } from '../model/ir-links';
import { remoteKeysOf } from '../model/remote-layout';
import { KeyGrid } from './key-grid';
import { RemoteExtras } from './remote-extras';
import { RemoteFace } from './remote-face';
import { RemotePad } from './remote-pad';
import { useLearnedSource, useLibrarySource, type RemoteSource } from './remote-source';
import { SceneSheet } from './scene-sheet';
import { useRemoteSend } from './use-remote-send';

interface Remotes {
  readonly blaster: Device | null;
  readonly library: readonly Device[];
  readonly remotes: readonly IrRemoteRow[];
}

const EVERY_DEVICE = { includeHidden: true } as const;

function sameRemotes(left: Remotes, right: Remotes): boolean {
  return (
    left.blaster === right.blaster &&
    shallowEqual(left.library, right.library) &&
    shallowEqual(left.remotes, right.remotes)
  );
}

export function useRemotes(device: Device): Remotes {
  return useStoreSelector(
    (state): Remotes => {
      const devices = devicesIn(state, EVERY_DEVICE);
      const linked = blasterOf(device, devices);
      return {
        blaster: devices.find((candidate) => candidate.id === linked?.id) ?? null,
        library:
          device.kind === 'ir_blaster'
            ? devices.filter(
                (candidate) => candidate.kind === 'ir_remote' && candidate.parent_id === device.id,
              )
            : [],
        remotes: remotesShownOn(device, rowsOf(state.tables.ir_remotes), devices),
      };
    },
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

function LibraryRemote({ device }: { readonly device: Device }): ReactNode {
  const source = useLibrarySource(device);
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
  library,
  remotes,
}: {
  readonly blaster: Device;
  readonly library: readonly Device[];
  readonly remotes: readonly IrRemoteRow[];
}): ReactNode {
  const [scene, setScene] = useState(false);
  const settings = href.settings.device(blaster.id, 'remotes');
  return (
    <>
      {library.map((device) => (
        <LibraryRemote key={device.id} device={device} />
      ))}
      {remotes.map((remote) => (
        <LearnedRemote key={remote.id} blaster={blaster} remote={remote} />
      ))}
      {library.length === 0 && remotes.length === 0 ? (
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
  const { blaster, library, remotes } = useRemotes(device);
  const name = useDisplayName(device.id);
  const reason = device.online ? null : offlineReason(name);
  const own = device.kind === 'ir_remote';
  return (
    <View className="gap-section-gap">
      {own ? <LibraryRemote device={device} /> : null}
      {!own && remoteKeysOf(device.capabilities).length > 0 ? (
        <PlainPad device={device} reason={reason} />
      ) : null}
      {blaster === null ? null : own ? (
        remotes.map((remote) => <LearnedRemote key={remote.id} blaster={blaster} remote={remote} />)
      ) : (
        <BlasterRemotes blaster={blaster} library={library} remotes={remotes} />
      )}
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
