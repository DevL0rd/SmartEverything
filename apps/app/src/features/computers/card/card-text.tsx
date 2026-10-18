import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FigureText } from '../../../components/figure';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import { useDeviceDerived } from '../../../store/selectors';
import { useComputerSelect } from '../data/computer-metrics';
import { headlineOf } from '../model/computer-headlines';
import { rateParts, type RateParts } from '../model/computer-view';
import { spokenFact } from '../model/spoken-unit';
import { SeriesSpark, type TileLook } from './vital-parts';

interface Traffic {
  readonly down: RateParts;
  readonly up: RateParts | null;
}

interface TrafficProps {
  readonly deviceId: string;
  readonly look: TileLook;
}

const DOWNLOAD_SERIES = 'summary/downloadRate';

function Spark({ deviceId, look, stale }: TrafficProps & { readonly stale: boolean }): ReactNode {
  if (look.spark === null) return null;
  return (
    <SeriesSpark
      deviceId={deviceId}
      seriesId={DOWNLOAD_SERIES}
      colour="viz-blue"
      height={look.spark}
      stale={stale}
      domain={undefined}
    />
  );
}

function TrafficTile({
  deviceId,
  look,
  traffic,
  stale,
}: TrafficProps & { readonly traffic: Traffic | null; readonly stale: boolean }): ReactNode {
  if (traffic === null) return null;
  const { down, up } = traffic;
  const figure = (
    <FigureText text={down.value} unit={down.unit} size="s" tone="default" stale={stale} />
  );
  return (
    <View
      accessible
      accessibilityLabel={spokenFact('Download', down.value, down.unit)}
      className="min-w-0 flex-1 gap-1"
    >
      <View className="flex-row items-center justify-between gap-1">
        <Text variant="caption" tone="variant">
          Network
        </Text>
        {up === null ? null : (
          <Text variant="caption" tone={stale ? 'faint' : 'variant'} className="tabular">
            {`↑ ${up.value} ${up.unit}`}
          </Text>
        )}
      </View>
      {look.inline ? (
        <View className="min-w-0 flex-row items-end gap-3">
          {figure}
          <View className="min-w-0 flex-1">
            <Spark deviceId={deviceId} look={look} stale={stale} />
          </View>
        </View>
      ) : (
        <>
          {figure}
          <Spark deviceId={deviceId} look={look} stale={stale} />
        </>
      )}
    </View>
  );
}

function LiveTraffic(props: TrafficProps): ReactNode {
  const traffic = useComputerSelect(
    props.deviceId,
    (parts) =>
      parts.summary === undefined
        ? null
        : { down: rateParts(parts.summary.downloadRate), up: rateParts(parts.summary.uploadRate) },
    sameJson,
  );
  return <TrafficTile {...props} traffic={traffic} stale={false} />;
}

function HeldTraffic(props: TrafficProps): ReactNode {
  const traffic = useDeviceDerived(
    props.deviceId,
    (values) => {
      const down = headlineOf(values, 'download_rate');
      return down === null ? null : { down: rateParts(down.value), up: null };
    },
    [],
    sameJson,
  );
  return <TrafficTile {...props} traffic={traffic} stale />;
}

export function NetworkTile({
  stale,
  ...props
}: TrafficProps & { readonly stale: boolean }): ReactNode {
  return stale ? <HeldTraffic {...props} /> : <LiveTraffic {...props} />;
}
