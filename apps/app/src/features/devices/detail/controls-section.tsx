import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { PROVIDER_INFO, type PresentedCapability } from '@smarteverything/domain';
import { EmptyState } from '../../../components/empty-state';
import { Grid } from '../../../components/grid';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { FAMILY_CONTROLS } from '../controls/family-controls';
import { CapabilityRow } from '../controls/capability-row';
import { offlineReason } from '../controls/guard';
import { usePrimaryControls } from '../controls/primary-controls';
import { controlGroupsOf, extrasOf, type ControlGroup } from '../model/control-groups';
import { useDisplayName } from '../model/display-name';
import { useDeviceModel } from '../model/device-model';
import { stagedRoles } from './stage-level';

const MIN_CONTROL_GROUP_WIDTH = 420;

function Extras({
  device,
  reason,
  extras,
  open,
  toggle,
}: {
  readonly device: Device;
  readonly reason: string | null;
  readonly extras: readonly PresentedCapability[];
  readonly open: boolean;
  readonly toggle: () => void;
}): ReactNode {
  const provider = PROVIDER_INFO[device.provider].name;
  return (
    <List
      title={`Provider extras (${String(extras.length)})`}
      footer={`Extra settings from ${provider}, with their own names.`}
    >
      <ListRow
        title={open ? 'Hide provider extras' : 'Show provider extras'}
        icon={open ? 'chevronUp' : 'chevronDown'}
        onPress={toggle}
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

function ControlLists({
  device,
  reason,
  groups,
  extras,
}: {
  readonly device: Device;
  readonly reason: string | null;
  readonly groups: readonly ControlGroup[];
  readonly extras: readonly PresentedCapability[];
}): ReactNode {
  const [open, setOpen] = useState(false);
  const columns = groups.length + Number(extras.length > 0);
  if (columns === 0) return null;
  return (
    <Grid
      minItemWidth={MIN_CONTROL_GROUP_WIDTH}
      maxColumns={columns}
      cellClassName="max-w-reading"
      stretchLastRow={false}
    >
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
      {extras.length === 0 ? null : (
        <Extras
          device={device}
          reason={reason}
          extras={extras}
          open={open}
          toggle={() => {
            setOpen(!open);
          }}
        />
      )}
    </Grid>
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
  const extras = extrasOf(model.presentation);
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
      {all.length === 0 && extras.length === 0 ? (
        <EmptyState
          icon="customize"
          title="Nothing to control"
          body={`${name} only reports readings.`}
        />
      ) : null}
      <CustomControls device={device} beside={beside} />
      <ControlLists device={device} reason={reason} groups={groups} extras={extras} />
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
