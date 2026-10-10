import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { IrCodeRow, IrRemoteRow } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Text } from '../../../components/text';
import { href } from '../../../app-shell/hrefs';
import { useControl } from '../../../store/control';
import { useDevices, useIrCodes, useIrRemotes } from '../../../store/selectors';
import type { Device } from '../../../store/state';
import { ControlBlock } from '../controls/control-block';
import { Guard, offlineReason } from '../controls/guard';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { blasterOf, remotesShownOn } from '../model/ir-links';
import { remoteKeysOf } from '../model/remote-layout';
import { RemotePad } from './remote-pad';

function LearnedRemote({
  blaster,
  remote,
}: {
  readonly blaster: Device;
  readonly remote: IrRemoteRow;
}): ReactNode {
  const codes = useIrCodes(remote.id);
  const control = useControl(blaster.id, 'ir_send');
  const send = (code: IrCodeRow): void => {
    void control.set({ format: code.format, code: code.code });
  };
  return (
    <Card title={remote.name} icon="remote">
      {codes.length === 0 ? (
        <Text variant="callout" tone="variant">
          No buttons learned yet.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-2">
          {codes.map((code) => (
            <Button
              key={code.id}
              label={code.button}
              variant="tonal"
              onPress={() => {
                send(code);
              }}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

export function useRemotes(device: Device): {
  readonly blaster: Device | null;
  readonly remotes: readonly IrRemoteRow[];
} {
  const devices = useDevices({ includeHidden: true });
  const remotes = useIrRemotes();
  const linked = blasterOf(device, devices);
  const blaster = devices.find((candidate) => candidate.id === linked?.id) ?? null;
  return { blaster, remotes: remotesShownOn(device, remotes, devices) };
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

export function RemoteSection({ device }: { readonly device: Device }): ReactNode {
  const { blaster, remotes } = useRemotes(device);
  const name = useDisplayName(device.id);
  const reason = device.online ? null : offlineReason(name);
  return (
    <View className="gap-section-gap">
      {remoteKeysOf(device.capabilities).length === 0 ? null : (
        <Card>
          <View className="gap-6">
            <Guard reason={reason}>
              <RemotePad device={device} />
            </Guard>
            <MediaKeys device={device} reason={reason} />
          </View>
        </Card>
      )}
      {blaster === null
        ? null
        : remotes.map((remote) => (
            <LearnedRemote key={remote.id} blaster={blaster} remote={remote} />
          ))}
      {blaster !== null && remotes.length === 0 ? (
        <EmptyState
          icon="remote"
          title="No learned buttons"
          body="Teach this blaster the buttons of a remote."
          action={
            <Button label="Learn buttons" href={href.settings.device(blaster.id, 'remotes')} />
          }
        />
      ) : null}
    </View>
  );
}

const IR_KINDS: ReadonlySet<Device['kind']> = new Set(['ir_blaster', 'ir_remote']);

export function hasRemote(device: Device): boolean {
  return remoteKeysOf(device.capabilities).length > 0 || IR_KINDS.has(device.kind);
}
