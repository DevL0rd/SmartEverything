import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { doingSince, isLow } from '../model/face-model';
import { BatteryChart } from './battery-spark';
import { BatteryFigure, WordLine } from './card-parts';
import { ArtLane } from './art-lane';
import { AccessChip, PhoneBand } from './control-rows';
import { FaceHeader } from './face-header';
import { NowPlayingRow } from './media-row';
import type { PhoneFaceData } from './use-phone-face';
import { XlColumn } from './xl-column';

const TOUCH_CHART = 72;
const POINTER_CHART = 52;

function Summary({
  data,
  compact,
}: {
  readonly data: PhoneFaceData;
  readonly compact: boolean;
}): ReactNode {
  const { readings, online, access, word } = data;
  const since = online ? doingSince(readings.doing) : null;
  return (
    <View className="min-w-0 gap-0.5" pointerEvents="none">
      {online && access.dnd === 'needs_permission' ? (
        <AccessChip />
      ) : (
        <WordLine word={word} detail={online} />
      )}
      {since === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {since}
        </Text>
      )}
      <BatteryFigure readings={readings} size={compact ? 'm' : 'l'} stale={!online} />
    </View>
  );
}

function Panel({
  data,
  tall,
}: {
  readonly data: PhoneFaceData;
  readonly tall: boolean;
}): ReactNode {
  const { device, readings, online, access } = data;
  const pointer = useIdiom() === 'pointer';
  return (
    <View className="min-h-0 min-w-0 flex-1 gap-2" pointerEvents="box-none">
      <Summary data={data} compact={pointer} />
      <View className="min-h-0 flex-1" pointerEvents="none">
        <BatteryChart
          deviceId={device.id}
          low={isLow(readings)}
          stale={!online}
          height={pointer ? POINTER_CHART : TOUCH_CHART}
        />
      </View>
      {online && access.view.canAct ? (
        <NowPlayingRow
          device={device}
          playing={data.controls.playing}
          title={data.controls.title}
          wide={tall}
        />
      ) : null}
    </View>
  );
}

export function LargeFace({
  data,
  tall,
}: {
  readonly data: PhoneFaceData;
  readonly tall: boolean;
}): ReactNode {
  return (
    <ArtLane cls={tall ? 'xl' : 'l'} data={data}>
      <FaceHeader data={data} chips={tall} />
      {tall ? (
        <View className="min-h-0 flex-1 flex-row gap-6" pointerEvents="box-none">
          <Panel data={data} tall />
          <XlColumn
            device={data.device}
            access={data.access}
            notificationCount={data.readings.notificationCount}
            screenMinutes={data.readings.screenMinutes}
          />
        </View>
      ) : (
        <Panel data={data} tall={false} />
      )}
      <PhoneBand data={data} layout="l" />
    </ArtLane>
  );
}
