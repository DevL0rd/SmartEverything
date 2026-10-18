import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { doingSince, isLow } from '../model/face-model';
import { BatteryChart } from './battery-spark';
import { BatteryFigure, WordLine } from './card-parts';
import { AccessChip, ControlRow } from './control-rows';
import { FaceHeader } from './face-header';
import { NowPlayingRow } from './media-row';
import { PhoneArt } from './phone-art';
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
    <View className="min-w-0 flex-1 gap-0.5" pointerEvents="none">
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
    <View className="min-w-0 flex-1 gap-2" pointerEvents="box-none">
      <View className="flex-row items-center gap-3" pointerEvents="none">
        <PhoneArt device={device} foldable={access.fold} tall />
        <Summary data={data} compact={pointer} />
      </View>
      <View className="min-h-16 flex-1" pointerEvents="none">
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
      <ControlRow controls={data.controls} layout="l" />
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
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <FaceHeader data={data} chips={tall} />
      <View className="min-h-0 flex-1 flex-row gap-6" pointerEvents="box-none">
        <Panel data={data} tall={tall} />
        {tall ? (
          <XlColumn
            device={data.device}
            access={data.access}
            notificationCount={data.readings.notificationCount}
            screenMinutes={data.readings.screenMinutes}
          />
        ) : null}
      </View>
    </View>
  );
}
