import { ORALB_HANDLE_COLOURS, type OralbSettings } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { List } from '../../../components/section';
import { Text } from '../../../components/text';
import { Interactive } from '../../../components/interactive';
import { useColour } from '../../../design/colour';
import { cn } from '../../../design/cn';
import { HANDLE_MATERIAL } from '../../../features/device-visuals/model/io-look';
import { useConfigure } from '../../toothbrush/data/brush-act';
import { tintStyle } from '../../toothbrush/charts/style';
import { Anchored } from '../../toothbrush/settings/anchored';
import type { SettingsProps } from '../../toothbrush/settings/settings-props';
import { borderColorStyle } from '../charts/style';
import { useOralbConfig } from '../data/use-oralb';

type Colour = OralbSettings['handleColour'];

function Choice({
  colour,
  current,
  onPick,
}: {
  readonly colour: Colour;
  readonly current: boolean;
  readonly onPick: () => void;
}): ReactNode {
  const edge = useColour('on-surface');
  return (
    <Interactive
      role="radio"
      label={`${colour}${current ? ', current' : ''}`}
      selected={current}
      onPress={onPick}
      className="min-h-touch-min min-w-10 flex-1 items-center justify-center"
    >
      <View
        className={cn('size-9 rounded-full border-2')}
        style={[
          tintStyle(HANDLE_MATERIAL[colour].body, 1),
          borderColorStyle(current ? edge : 'transparent'),
        ]}
      />
    </Interactive>
  );
}

export function LookList({ deviceId, state }: SettingsProps): ReactNode {
  const { oralb } = useOralbConfig(deviceId);
  const configure = useConfigure(deviceId);
  if (!state.mayConfigure) {
    return null;
  }
  return (
    <Anchored deviceId={deviceId} id="oralb-look" label="Look">
      <List
        inset
        title="Look"
        footer="Only changes how the handle is drawn in the app. It does not change the brush."
      >
        <Anchored deviceId={deviceId} id="oralb-handle-colour" label="Handle colour">
          <View className="gap-2 px-4 py-2">
            <Text variant="body">Handle colour</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Handle colour"
              className="flex-row gap-1"
            >
              {ORALB_HANDLE_COLOURS.map((colour) => (
                <Choice
                  key={colour}
                  colour={colour}
                  current={oralb.handleColour === colour}
                  onPick={() => {
                    configure({ oralb: { handleColour: colour } });
                  }}
                />
              ))}
            </View>
          </View>
        </Anchored>
      </List>
    </Anchored>
  );
}
