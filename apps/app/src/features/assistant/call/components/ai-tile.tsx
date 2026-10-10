import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { orbStateOf, type CallView } from '../call-state';
import { AssistantOrb } from '../orb';

const TILE_ORB = 40;

const WORDS = {
  idle: 'Idle',
  listening: 'Listening',
  thinking: 'Working',
  speaking: 'Speaking',
} as const;

export interface AiTileProps {
  readonly call: CallView;
  readonly level: SharedValue<number>;
  readonly stoppable: boolean;
  readonly onStop: () => void;
}

export function AiTile({ call, level, stoppable, onStop }: AiTileProps): ReactNode {
  const state = orbStateOf(call);
  const reconnecting = call.phase === 'reconnecting';
  const body = (
    <View className="size-16 items-center justify-center gap-1 rounded-lg bg-surface-raised/90">
      <AssistantOrb state={state} level={level} size={TILE_ORB} dimmed={reconnecting} />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {stoppable ? 'Stop' : WORDS[state]}
      </Text>
    </View>
  );
  return stoppable ? (
    <Interactive
      label="Stop the assistant talking"
      onPress={onStop}
      className="rounded-lg"
      layerClassName="rounded-lg"
    >
      {body}
    </Interactive>
  ) : (
    <View accessible accessibilityLabel={`Assistant, ${WORDS[state].toLowerCase()}`}>
      {body}
    </View>
  );
}
