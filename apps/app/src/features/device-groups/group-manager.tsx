import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { API_ENDPOINTS as E, type DeviceGroupRow } from '@smarteverything/domain';
import { api, useConnection } from '../../api/transport';
import { useServerDeviceGroups } from '../../api/connection/server-capabilities';
import { Button } from '../../components/button';
import { confirm } from '../../components/confirm-store';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { notify } from '../../components/toast-store';
import { useDevices } from '../../store/selectors';
import { useStoreSelector } from '../../store/store-context';
import type { Device } from '../../store/state';
import { DeviceGroupCard } from './group-card';
import { GroupEditor } from './group-editor';

type Editor = { readonly group: DeviceGroupRow | null } | null;

function GroupItems({
  groups,
  devices,
  edit,
}: {
  readonly groups: readonly DeviceGroupRow[];
  readonly devices: readonly Device[];
  readonly edit: (group: DeviceGroupRow) => void;
}): ReactNode {
  if (groups.length === 0)
    return (
      <Text variant="body" tone="variant">
        Group any devices for shared controls and automations.
      </Text>
    );
  return groups.map((group) => (
    <View key={group.id} className="gap-2">
      <DeviceGroupCard
        title={group.name}
        devices={devices.filter((device) => group.device_ids.includes(device.id))}
        onEdit={() => {
          edit(group);
        }}
      />
      <MissingMembers group={group} devices={devices} />
      <Button
        label={`Remove ${group.name}`}
        variant="text"
        onPress={() => {
          void removeGroup(group);
        }}
      />
    </View>
  ));
}

function MissingMembers({
  group,
  devices,
}: {
  readonly group: DeviceGroupRow;
  readonly devices: readonly Device[];
}): ReactNode {
  const missing = group.device_ids.filter((id) => !devices.some((device) => device.id === id));
  return missing.length === 0 ? null : (
    <Text variant="callout" tone="critical">
      {`${String(missing.length)} group members no longer exist. Edit the group to update its members.`}
    </Text>
  );
}

function GroupDialog({
  open,
  close,
  create,
  groups,
  devices,
  edit,
}: {
  readonly open: boolean;
  readonly close: () => void;
  readonly create: () => void;
  readonly groups: readonly DeviceGroupRow[];
  readonly devices: readonly Device[];
  readonly edit: (group: DeviceGroupRow) => void;
}): ReactNode {
  return (
    <Sheet detents={['full']} open={open} onClose={close} title="Device groups">
      <View className="gap-4">
        <Button label="New group" icon="plus" variant="tonal" onPress={create} />
        <GroupItems groups={groups} devices={devices} edit={edit} />
      </View>
    </Sheet>
  );
}

export function DeviceGroups(): ReactNode {
  const { groups: requested } = useLocalSearchParams<{ groups?: string }>();
  const connection = useConnection();
  const available = useServerDeviceGroups(
    connection.status === 'paired' ? connection.connection.url : null,
  );
  const groups = useStoreSelector((state) => state.tables.device_groups.rows);
  const devices = useDevices({ includeHidden: true });
  const [open, setOpen] = useState(requested !== undefined);
  const [editor, setEditor] = useState<Editor>(requested === 'new' ? { group: null } : null);
  if (!available) return null;
  return (
    <>
      <View className="flex-row justify-end">
        <Button
          label="Device groups"
          icon="layers"
          variant="text"
          onPress={() => {
            setOpen(true);
          }}
        />
      </View>
      <GroupDialog
        open={open}
        close={() => {
          setOpen(false);
        }}
        create={() => {
          setEditor({ group: null });
        }}
        groups={[...groups].sort((a, b) => Number(b.id === requested) - Number(a.id === requested))}
        devices={devices}
        edit={(group) => {
          setEditor({ group });
        }}
      />
      {editor === null ? null : (
        <GroupEditor
          key={editor.group?.id ?? 'new'}
          group={editor.group}
          devices={devices}
          onClose={() => {
            setEditor(null);
          }}
        />
      )}
    </>
  );
}

async function removeGroup(group: DeviceGroupRow): Promise<void> {
  if (
    !(await confirm({
      title: `Remove ${group.name}?`,
      body: 'Its devices keep their settings. Automations using this group will need another target.',
      confirmLabel: 'Remove group',
      tone: 'destructive',
    }))
  )
    return;
  try {
    await api().call(E.removeDeviceGroup, { params: { groupId: group.id } });
  } catch (error) {
    notify({ message: 'The device group was not removed', error, tone: 'critical' });
  }
}
