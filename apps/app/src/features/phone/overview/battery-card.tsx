import type { ReactNode } from 'react';
import { href } from '../../../app-shell/hrefs';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { clock } from '../../../format/time';
import type { Device } from '../../../store/state';
import { BatteryChart } from '../card/battery-spark';
import { usePhoneFace } from '../card/use-phone-face';
import { isLow } from '../model/face-model';

const CHART_HEIGHT = 150;

export function BatteryCard({ device }: { readonly device: Device }): ReactNode {
  const { readings, online } = usePhoneFace(device);
  if (readings.battery === null) return null;
  return (
    <Card title="Battery today" icon="battery" href={href.settings.device(device.id, 'battery')}>
      <BatteryChart
        deviceId={device.id}
        low={isLow(readings)}
        stale={!online}
        height={CHART_HEIGHT}
      />
      <Text variant="footnote" tone="variant">
        {online
          ? 'Last 24 hours, green bands are charging.'
          : `Last reading ${readings.reportedAt === null ? 'unknown' : clock(readings.reportedAt)}.`}
      </Text>
    </Card>
  );
}
