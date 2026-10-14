import { FirmwareUpload } from './firmware-upload';
import { usePresenceSelection } from './use-presence-selection';
import { type ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import type { ShellyPresenceDevice, ShellyPresencePage } from '@smarteverything/domain';
import { Card } from '../../components/card';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { List } from '../../components/section';
import { NavRow } from '../../components/rows';
import { CoreForm } from './core-form';
import { componentGroups, type ComponentGroup } from './component-groups';
import { ManagementActions } from './management-actions';
import { ComponentSettings } from './component-settings';
import { ResourcePage, resourceForPage } from './resource-pages';
import { ComponentStatus } from './component-status';

function ComponentEditor({
  sensor,
  group,
  close,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly group: ComponentGroup;
  readonly close: () => void;
}): ReactNode {
  return (
    <View className="gap-section-gap">
      <ComponentStatus component={group.component} />
      <Card title={group.title}>
        <CoreForm
          sensor={sensor}
          fields={group.fields}
          accepted={group.component.config}
          action="set_component"
          component={group.component.component}
        />
      </Card>
      <Button label="Back" variant="text" onPress={close} />
    </View>
  );
}

export function AdvancedSettings({
  sensor,
  page,
}: {
  readonly sensor: ShellyPresenceDevice;
  readonly page: ShellyPresencePage;
}): ReactNode {
  const params = useLocalSearchParams<{ readonly focus?: string }>();
  const groups = componentGroups(sensor, page);
  const [selected, setSelected] = usePresenceSelection(
    'group',
    groups.find((group) => group.focus === params.focus)?.key ?? null,
  );
  const chosen = groups.find((group) => group.key === selected);
  const resource = resourceForPage(page);
  if (page === 'presence-components') return <ComponentSettings sensor={sensor} />;
  if (resource !== null) return <ResourcePage sensor={sensor} resource={resource} />;
  if (chosen !== undefined)
    return (
      <ComponentEditor
        key={chosen.key}
        sensor={sensor}
        group={chosen}
        close={() => {
          setSelected(null);
        }}
      />
    );
  return (
    <View className="gap-section-gap">
      <GroupList groups={groups} select={setSelected} />
      <ManagementActions sensor={sensor} page={page} />
      {page === 'presence-device' ? <FirmwareUpload sensor={sensor} /> : null}
      {groups.length === 0 &&
      !sensor.features.some((feature) => feature.page === page && feature.available) ? (
        <EmptyState
          icon="settings"
          title="No supported configuration found"
          body="Only components advertised by this sensor appear here."
        />
      ) : null}
    </View>
  );
}

function GroupList({
  groups,
  select,
}: {
  readonly groups: readonly ComponentGroup[];
  readonly select: (value: string) => void;
}): ReactNode {
  return groups.length === 0 ? null : (
    <List>
      {groups.map((group) => (
        <NavRow
          key={group.key}
          title={group.title}
          onPress={() => {
            select(group.key);
          }}
        />
      ))}
    </List>
  );
}
