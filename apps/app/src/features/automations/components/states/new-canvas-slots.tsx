import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { STATES_COPY } from './states-copy';

function Slot({
  label,
  hint,
  onPress,
}: {
  readonly label: string;
  readonly hint: string;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      onPress={onPress}
      label={label}
      hint={hint}
      role="button"
      className="min-h-touch-min rounded-lg"
    >
      <View className="min-h-14 flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-outline px-4 py-3">
        <Icon name="plus" size={20} tone="primary" />
        <Text variant="body-strong" tone="primary">
          {label}
        </Text>
      </View>
    </Interactive>
  );
}

export interface NewCanvasSlotsProps {
  readonly onAddTrigger: () => void;
  readonly onAddStep: () => void;
}

export function NewCanvasSlots({ onAddTrigger, onAddStep }: NewCanvasSlotsProps): ReactNode {
  const copy = STATES_COPY.newCanvas;
  return (
    <View className="gap-3">
      <Slot label={copy.trigger} hint={copy.triggerHint} onPress={onAddTrigger} />
      <Slot label={copy.step} hint={copy.stepHint} onPress={onAddStep} />
    </View>
  );
}
