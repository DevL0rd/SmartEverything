import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useDeviceValue } from '../../../store/selectors';
import { batterySessionsLine } from '../model/care-model';

export function OralbBatteryExtras({
  deviceId,
  view,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
}): ReactNode {
  const runtime = useDeviceValue(deviceId, 'brush_charge_runtime')?.value;
  const line = batterySessionsLine(
    typeof runtime === 'number' ? runtime : null,
    view.frame.routineS,
  );
  if (line === null) {
    return null;
  }
  return (
    <Card title="On this charge" icon="battery">
      <Text variant="callout">{line}</Text>
    </Card>
  );
}
