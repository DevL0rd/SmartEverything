import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { ListRow } from '../../../components/list-row';
import { ReasonLine } from '../../../components/reason-line';
import { List } from '../../../components/section';
import type { Device } from '../../../store/state';
import { featuresOf } from '../model/face-model';
import { allowedCount, featureRowsOf, type FeatureRow } from '../model/setup-model';

const STATE_VALUE: Readonly<Record<FeatureRow['state'], string>> = {
  ready: 'Allowed',
  needs_permission: 'Off',
  unsupported: 'Not on this phone',
};

function FeatureListRow({ row }: { readonly row: FeatureRow }): ReactNode {
  const ready = row.state === 'ready';
  return (
    <ListRow
      title={row.title}
      subtitle={row.why}
      icon={ready ? 'circleCheck' : row.state === 'unsupported' ? 'circleX' : row.icon}
      iconTone={ready ? 'positive' : row.state === 'needs_permission' ? 'warning' : 'variant'}
      value={STATE_VALUE[row.state]}
      label={`${row.title}, ${STATE_VALUE[row.state]}`}
    />
  );
}

export function RemoteSetup({ device }: { readonly device: Device }): ReactNode {
  const rows = featureRowsOf(featuresOf(device.details));
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="smartphone"
        title="Nothing reported yet"
        body={`Open SmartEverything on ${device.label} so it can tell your home what it can share.`}
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <List title="What this phone shares" caption={allowedCount(rows)}>
        {rows.map((row) => (
          <FeatureListRow key={row.feature} row={row} />
        ))}
      </List>
      <ReasonLine
        icon="info"
        text={`Read only. Open SmartEverything on ${device.label} to change these.`}
      />
    </View>
  );
}
