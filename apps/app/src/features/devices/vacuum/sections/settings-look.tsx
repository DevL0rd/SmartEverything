import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { VACUUM_FINISHES, VACUUM_FINISH_NAMES, type VacuumFinish } from '@smarteverything/domain';
import { Interactive } from '../../../../components/interactive';
import { List } from '../../../../components/section';
import { Text } from '../../../../components/text';
import { useColour } from '../../../../design/colour';
import type { Device } from '../../../../store/state';
import { chooseVacuumFinish, useVacuumFinish } from '../../../device-visuals';
import { RobotPin } from '../components/robot-pin';

export const LOOK_TITLE = 'Appearance';

export const FINISH_LABEL = 'Robot colour';

const SWATCH_PX = 44;

const PIN_RADIUS = 17;

const PIN_FACING = -90;

function Choice({
  finish,
  current,
  onPick,
}: {
  readonly finish: VacuumFinish;
  readonly current: boolean;
  readonly onPick: () => void;
}): ReactNode {
  const ring = useColour(current ? 'primary' : 'outline-variant');
  const name = VACUUM_FINISH_NAMES[finish];
  return (
    <Interactive
      role="radio"
      label={`${name}${current ? ', current' : ''}`}
      selected={current}
      onPress={onPick}
      className="min-h-touch-min flex-1 items-center justify-center gap-1 py-2"
    >
      <Svg
        width={SWATCH_PX}
        height={SWATCH_PX}
        viewBox={`${String(-SWATCH_PX / 2)} ${String(-SWATCH_PX / 2)} ${String(SWATCH_PX)} ${String(SWATCH_PX)}`}
      >
        <RobotPin r={PIN_RADIUS} rotation={PIN_FACING} ring={ring} finish={finish} />
      </Svg>
      <Text variant="footnote" tone={current ? 'default' : 'variant'}>
        {name}
      </Text>
    </Interactive>
  );
}

export function VacuumLookSettings({ device }: { readonly device: Device }): ReactNode {
  const chosen = useVacuumFinish(device.id);
  return (
    <List
      title={LOOK_TITLE}
      footer="Only changes how the robot and its station are drawn in the app. It does not change the robot."
    >
      <View className="gap-2 px-4 py-2">
        <Text variant="body">{FINISH_LABEL}</Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={FINISH_LABEL}
          className="flex-row gap-1"
        >
          {VACUUM_FINISHES.map((finish) => (
            <Choice
              key={finish}
              finish={finish}
              current={chosen === finish}
              onPick={() => {
                chooseVacuumFinish(device.id, finish);
              }}
            />
          ))}
        </View>
      </View>
    </List>
  );
}
