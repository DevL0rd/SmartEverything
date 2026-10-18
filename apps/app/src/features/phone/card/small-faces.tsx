import type { ReactNode } from 'react';
import { View } from 'react-native';
import { BatterySpark } from './battery-spark';
import { BatteryFigure, PlayingLine, SignalStat, WordLine } from './card-parts';
import { AccessChip, ControlRow } from './control-rows';
import { FaceHeader } from './face-header';
import { PhoneArt } from './phone-art';
import type { PhoneFaceData } from './use-phone-face';
import { isLow } from '../model/face-model';

const SPARK_HEIGHT = 28;

function StatsRow({ data }: { readonly data: PhoneFaceData }): ReactNode {
  const { readings, online, access, word } = data;
  const blocked = online && access.dnd === 'needs_permission';
  return (
    <View className="min-h-5 flex-row items-center gap-2.5 overflow-hidden" pointerEvents="none">
      {blocked ? <AccessChip /> : <WordLine word={word} detail={false} />}
      {online ? (
        <SignalStat
          kind={readings.networkKind}
          bars={readings.signalBars}
          stale={false}
          large={false}
        />
      ) : null}
      {online ? (
        <PlayingLine title={readings.playback === 'playing' ? readings.nowPlaying : null} />
      ) : null}
    </View>
  );
}

export function MediumFace({ data }: { readonly data: PhoneFaceData }): ReactNode {
  const { device, readings, access, online } = data;
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <FaceHeader data={data} chips={false} />
      <View className="min-h-0 flex-1 flex-row items-center gap-3" pointerEvents="box-none">
        <PhoneArt device={device} foldable={access.fold} tall={false} />
        <View className="min-w-0 flex-1 justify-between gap-1" pointerEvents="box-none">
          <View className="flex-row items-center gap-2" pointerEvents="none">
            <BatteryFigure readings={readings} size="m" stale={!online} />
            <View className="min-w-0 flex-1">
              <BatterySpark
                deviceId={device.id}
                low={isLow(readings)}
                stale={!online}
                height={SPARK_HEIGHT}
              />
            </View>
          </View>
          <StatsRow data={data} />
          <ControlRow controls={data.controls} layout="m" />
        </View>
      </View>
    </View>
  );
}
