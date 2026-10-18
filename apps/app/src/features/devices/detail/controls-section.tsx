import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { PROVIDER_INFO } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { FAMILY_CONTROLS } from '../controls/family-controls';
import { CapabilityRow } from '../controls/capability-row';
import { offlineReason } from '../controls/guard';
import { usePrimaryControls } from '../controls/primary-controls';
import { controlGroupsOf, extrasOf } from '../model/control-groups';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { stagedRoles } from './stage-level';

function Extras({
  device,
  reason,
}: {
  readonly device: Device;
  readonly reason: string | null;
}): ReactNode {
  const model = useDeviceModel(device);
  const [open, setOpen] = useState(false);
  const extras = extrasOf(model.presentation);
  if (extras.length === 0) {
    return null;
  }
  const provider = PROVIDER_INFO[device.provider].name;
  return (
    <List
      title={`Provider extras (${String(extras.length)})`}
      footer={`Extra settings from ${provider}, with their own names.`}
    >
      <ListRow
        title={open ? 'Hide provider extras' : 'Show provider extras'}
        icon={open ? 'chevronUp' : 'chevronDown'}
        onPress={() => {
          setOpen(!open);
        }}
      />
      {open
        ? extras.map((presented) => (
            <CapabilityRow
              key={presented.key}
              device={device}
              presented={presented}
              reason={reason}
            />
          ))
        : []}
    </List>
  );
}

export function ControlsSection({
  device,
  beside,
}: {
  readonly device: Device;
  readonly beside: boolean;
}): ReactNode {
  const model = useDeviceModel(device);
  const name = useDisplayName(device.id);
  const primary = usePrimaryControls(device, stagedRoles(model));
  const reason = device.online ? null : offlineReason(name);
  const shown = new Set(beside ? primary.map((presented) => presented.key) : []);
  const custom = FAMILY_CONTROLS[model.family];
  const all = controlGroupsOf(model.presentation);
  const groups = all
    .map((group) => ({
      ...group,
      controls: group.controls.filter(
        (presented) => !shown.has(presented.key) && custom?.managed.has(presented.key) !== true,
      ),
    }))
    .filter((group) => group.controls.length > 0);
  return (
    <View className="gap-section-gap">
      {all.length === 0 && extrasOf(model.presentation).length === 0 ? (
        <EmptyState
          icon="customize"
          title="Nothing to control"
          body={`${name} only reports readings.`}
        />
      ) : null}
      <CustomControls device={device} beside={beside} />
      {groups.map((group) => (
        <List key={group.label} title={group.label}>
          {group.controls.map((presented) => (
            <CapabilityRow
              key={presented.key}
              device={device}
              presented={presented}
              reason={reason}
            />
          ))}
        </List>
      ))}
      <Extras device={device} reason={reason} />
    </View>
  );
}

function CustomControls({
  device,
  beside,
}: {
  readonly device: Device;
  readonly beside: boolean;
}): ReactNode {
  const Custom = FAMILY_CONTROLS[useDeviceModel(device).family]?.controls;
  return Custom === undefined || beside ? null : (
    <List title="Cooking">
      <View className="p-4">
        <Custom device={device} />
      </View>
    </List>
  );
}
