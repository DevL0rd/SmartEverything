import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../../../components/text';
import { usePhoneSection } from '../data/phone-detail';
import { isLow } from '../model/face-model';
import { BatterySpark } from './battery-spark';
import { BatteryFigure, MiniBars, ScreenTimeStat, SignalStat, WordLine } from './card-parts';
import { AccessChip, ControlRow } from './control-rows';
import { FaceHeader } from './face-header';
import { PhoneArt } from './phone-art';
import type { PhoneFaceData } from './use-phone-face';

const SPARK_HEIGHT = 24;

function Week({
  deviceId,
  minutes,
}: {
  readonly deviceId: string;
  readonly minutes: number | null;
}): ReactNode {
  const week = usePhoneSection(deviceId, 'screen')?.usage?.screenMinutesByDay;
  if (minutes === null || week === undefined) return null;
  return (
    <View className="w-14 justify-end">
      <MiniBars values={week.map((day) => day.minutes)} height={18} />
    </View>
  );
}

function Stats({ data }: { readonly data: PhoneFaceData }): ReactNode {
  const { device, readings, online, access, word } = data;
  const blocked = online && access.dnd === 'needs_permission';
  return (
    <View className="flex-row items-end gap-5" pointerEvents="none">
      <View>
        <Text variant="caption" tone="variant">
          Battery
        </Text>
        <View className="flex-row items-center gap-2">
          <BatteryFigure readings={readings} size="m" stale={!online} />
          <View className="w-20">
            <BatterySpark
              deviceId={device.id}
              low={isLow(readings)}
              stale={!online}
              height={SPARK_HEIGHT}
            />
          </View>
        </View>
      </View>
      <View className="gap-0.5">
        <Text variant="caption" tone="variant">
          Signal
        </Text>
        <SignalStat kind={readings.networkKind} bars={readings.signalBars} stale={!online} large />
      </View>
      <View className="flex-row items-end gap-2">
        <ScreenTimeStat minutes={readings.screenMinutes} stale={!online} />
        <Week deviceId={device.id} minutes={readings.screenMinutes} />
      </View>
      <View className="min-w-0 flex-1 items-end">
        {blocked ? <AccessChip /> : <WordLine word={word} detail={online} />}
      </View>
    </View>
  );
}

export function WideFace({ data }: { readonly data: PhoneFaceData }): ReactNode {
  const { device, access } = data;
  return (
    <View className="flex-1 gap-2" pointerEvents="box-none">
      <FaceHeader data={data} chips />
      <View className="min-h-0 flex-1 flex-row items-center gap-4" pointerEvents="box-none">
        <PhoneArt device={device} foldable={access.fold} tall={false} />
        <View className="min-w-0 flex-1 justify-between gap-2" pointerEvents="box-none">
          <Stats data={data} />
          <ControlRow controls={data.controls} layout="w" />
        </View>
      </View>
    </View>
  );
}
