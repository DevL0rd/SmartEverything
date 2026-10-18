import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { DeviceVisual } from '../../device-visuals';
import { DeviceScheduleChip } from '../../automations';
import { PowerButton } from './power-button';
import { stageText } from './state-line';
import type { TvSheets } from './sheet-state';
import type { Television } from './use-television';

export function Stage({
  tv,
  sheets,
}: {
  readonly tv: Television;
  readonly sheets: TvSheets;
}): ReactNode {
  const text = stageText(tv.view);
  const standby = tv.view.mode === 'standby' || tv.view.mode === 'turning_on';
  return (
    <View className="gap-3 rounded-xl border-hairline border-outline-variant bg-surface-1 p-3">
      <View className="flex-row items-center gap-3">
        <View className="size-14 items-center justify-center">
          <DeviceVisual device={tv.device} size="tile" />
        </View>
        <View className="min-w-0 flex-1 items-start gap-0.5">
          <Text variant="title-3" numberOfLines={2}>
            {text.title}
          </Text>
          {text.meta === '' ? null : (
            <Text variant="callout" tone="variant" numberOfLines={2}>
              {text.meta}
            </Text>
          )}
          <DeviceScheduleChip deviceId={tv.device.id} compact />
        </View>
        {standby ? null : <PowerButton tv={tv} />}
        <IconButton
          icon="timer"
          label="Sleep timer"
          variant="tonal"
          onPress={() => {
            sheets.open('sleep');
          }}
        />
      </View>
      {standby ? (
        <Button
          label={tv.view.mode === 'turning_on' ? 'Turning on…' : 'Turn on'}
          icon="power"
          size="lg"
          disabled={tv.view.mode === 'turning_on'}
          onPress={tv.togglePower}
        />
      ) : null}
    </View>
  );
}
