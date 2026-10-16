import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import {
  API_ENDPOINTS as E,
  DEVICE_GROUP_INPUT,
  type DeviceGroupRow,
} from '@smarteverything/domain';
import { api } from '../../api/transport';
import { Button } from '../../components/button';
import { Checkbox } from '../../components/checkbox';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { TextField } from '../../components/text-field';
import { notify } from '../../components/toast-store';
import type { Device } from '../../store/state';

interface Props {
  readonly group: DeviceGroupRow | null;
  readonly devices: readonly Device[];
  readonly onClose: () => void;
}
interface Draft {
  readonly name: string;
  readonly members: readonly string[];
  readonly busy: boolean;
  readonly valid: boolean;
  readonly setName: (name: string) => void;
  readonly setMembers: (members: readonly string[]) => void;
  readonly save: () => Promise<void>;
}

function useEditor({ group, onClose }: Props): Draft {
  const [name, setName] = useState(group?.name ?? '');
  const [members, setMembers] = useState<readonly string[]>(group?.device_ids ?? []);
  const [busy, setBusy] = useState(false);
  const input = DEVICE_GROUP_INPUT.safeParse({ name, device_ids: members });
  const save = async (): Promise<void> => {
    if (!input.success || busy) return;
    setBusy(true);
    try {
      if (group === null) await api().call(E.createDeviceGroup, { body: input.data });
      else
        await api().call(E.updateDeviceGroup, { params: { groupId: group.id }, body: input.data });
      onClose();
    } catch (error) {
      notify({ message: 'The device group did not save', error, tone: 'critical' });
    } finally {
      setBusy(false);
    }
  };
  return { name, setName, members, setMembers, busy, valid: input.success, save };
}

function Members({
  devices,
  draft,
}: {
  readonly devices: readonly Device[];
  readonly draft: Draft;
}): ReactNode {
  const { members, setMembers, busy } = draft;
  return (
    <>
      {devices.map((device) => (
        <Checkbox
          key={device.id}
          label={device.label}
          checked={members.includes(device.id)}
          disabled={busy || (!members.includes(device.id) && members.length >= 100)}
          onChange={(checked) => {
            setMembers(
              checked ? [...members, device.id] : members.filter((id) => id !== device.id),
            );
          }}
        />
      ))}
      {members
        .filter((id) => !devices.some((device) => device.id === id))
        .map((id) => (
          <Checkbox
            key={id}
            label="Removed device"
            checked
            disabled={busy}
            onChange={() => {
              setMembers(members.filter((member) => member !== id));
            }}
          />
        ))}
    </>
  );
}

export function GroupEditor(props: Props): ReactNode {
  const draft = useEditor(props);
  return (
    <Sheet
      detents={['full']}
      open
      title={props.group === null ? 'New device group' : 'Edit device group'}
      onClose={props.onClose}
      footer={
        <View className="flex-row justify-end gap-2">
          <Button label="Cancel" variant="text" disabled={draft.busy} onPress={props.onClose} />
          <Button
            label="Save"
            loading={draft.busy}
            disabled={!draft.valid || draft.busy}
            onPress={() => {
              void draft.save();
            }}
          />
        </View>
      }
    >
      <View className="gap-3">
        <TextField label="Name" value={draft.name} onChange={draft.setName} disabled={draft.busy} />
        <Text variant="callout" tone="variant">
          Choose up to 100 devices. Each control applies to the members that support it.
        </Text>
        <Members devices={props.devices} draft={draft} />
      </View>
    </Sheet>
  );
}
