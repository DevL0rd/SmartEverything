import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon, type IconName } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';

interface RoundButtonProps {
  readonly icon: IconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly look: 'tonal' | 'selected' | 'end';
}

const FRAME: Readonly<Record<RoundButtonProps['look'], string>> = {
  tonal: 'bg-surface-2',
  selected: 'bg-primary',
  end: 'bg-critical',
};

function RoundButton({ icon, label, onPress, look }: RoundButtonProps): ReactNode {
  return (
    <View className="items-center gap-2">
      <Interactive
        onPress={onPress}
        label={label}
        selected={look === 'selected'}
        className={cn('size-18 items-center justify-center rounded-full', FRAME[look])}
        layerClassName="rounded-full"
      >
        <Icon name={icon} size={32} tone={look === 'tonal' ? 'default' : 'onPrimary'} />
      </Interactive>
      <Text variant="caption" tone="variant">
        {label}
      </Text>
    </View>
  );
}

export interface CallControlsProps {
  readonly muted: boolean;
  readonly onMute: () => void;
  readonly onEnd: () => void;
}

export function CallControls({ muted, onMute, onEnd }: CallControlsProps): ReactNode {
  return (
    <View className="flex-row items-start justify-center gap-12">
      <RoundButton
        icon={muted ? 'micOff' : 'mic'}
        label={muted ? 'Unmute' : 'Mute'}
        onPress={onMute}
        look={muted ? 'selected' : 'tonal'}
      />
      <RoundButton icon="phoneOff" label="End" onPress={onEnd} look="end" />
    </View>
  );
}
