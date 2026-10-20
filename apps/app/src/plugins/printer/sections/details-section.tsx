import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { Gauge } from '../../../components/charts';
import { Text } from '../../../components/text';
import { ListRow } from '../../../components/list-row';
import { List } from '../../../components/section';
import { usePrinterLive } from '../../../features/device-visuals';
import type { Device } from '../../../store/state';
import { useSecondOf } from '../../../store/clock';
import { agoLabel } from '../model/format';
import { detailRows, uptimeLabel } from '../model/details-view';

const PPM_MAX = 60;

function Speed({
  ppm,
  colour,
}: {
  readonly ppm: number;
  readonly colour: number | null;
}): ReactNode {
  return (
    <Card title="Speed" icon="trendUp">
      <View className="flex-row items-center gap-4">
        <Gauge
          value={Math.min(ppm, PPM_MAX)}
          min={0}
          max={PPM_MAX}
          bands={[{ upTo: PPM_MAX, colour: 'primary' }]}
          size={112}
          label={`${String(ppm)} pages a minute`}
        >
          <Text variant="title-3" className="tabular">
            {String(ppm)}
          </Text>
        </Gauge>
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">{String(ppm)} pages a minute in black and white</Text>
          {colour === null ? null : (
            <Text variant="callout" tone="variant">
              {String(colour)} pages a minute in colour
            </Text>
          )}
          <Text variant="caption" tone="faint">
            Rated speed from the printer. Queue estimates use it.
          </Text>
        </View>
      </View>
    </Card>
  );
}

export function DetailsSection({ device }: { readonly device: Device }): ReactNode {
  const live = usePrinterLive(device);
  const now = useSecondOf((value) => value, false);
  if (live === null) return null;
  const { details } = live;
  return (
    <View className="gap-section-gap">
      <View className="flex-row flex-wrap gap-2">
        <Badge label={details.colour ? 'Colour' : 'Black and white'} tone="neutral" />
        {details.duplex ? <Badge label="Two-sided" tone="neutral" /> : null}
        {details.mfp ? <Badge label="Multifunction" tone="neutral" /> : null}
        <Badge
          label={details.security === 'ipps' ? 'Encrypted (ipps)' : 'Not encrypted (ipp)'}
          tone={details.security === 'ipps' ? 'positive' : 'warning'}
        />
      </View>
      {details.ppm === null ? null : <Speed ppm={details.ppm} colour={details.ppmColour} />}
      <List>
        {detailRows(details).map((row) => (
          <ListRow key={row.label} title={row.label} value={row.value} />
        ))}
        {details.uptimeSeconds === null ? null : (
          <ListRow title="Running for" value={uptimeLabel(details.uptimeSeconds)} />
        )}
        {details.lastSeen === null ? null : (
          <ListRow title="Last seen" value={agoLabel(Date.parse(details.lastSeen), now)} />
        )}
      </List>
    </View>
  );
}
