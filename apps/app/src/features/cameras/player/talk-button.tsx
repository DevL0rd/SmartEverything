import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { selectionTick } from '../../../platform/haptics';

export interface TalkButtonProps {
  readonly talking: boolean;
  readonly pending: boolean;
  readonly setTalking: (talking: boolean) => void;
}

function labelOf(talking: boolean, pending: boolean): string {
  if (talking) {
    return 'Mic on · tap to stop';
  }
  return pending ? 'Starting… tap to cancel' : 'Tap to talk';
}

function shapeOf(touch: boolean, talking: boolean): string {
  return cn(
    'flex-row items-center gap-2 rounded-full px-5',
    touch ? 'h-14' : 'h-control-h',
    talking ? 'bg-critical' : 'bg-white/16',
  );
}

function hintOf(on: boolean): string {
  return on ? 'Turns your microphone off' : 'Turns your microphone on until you tap again';
}

export function TalkButton({ talking, pending, setTalking }: TalkButtonProps): ReactNode {
  const touch = useIdiom() === 'touch';
  const on = talking || pending;
  return (
    <Interactive
      role="button"
      label={on ? 'Stop talking' : 'Talk'}
      hint={hintOf(on)}
      selected={on}
      onTone={talking ? 'primary' : 'surface'}
      onPress={() => {
        selectionTick();
        setTalking(!on);
      }}
      className={shapeOf(touch, talking)}
    >
      {talking ? <View className="size-2.5 rounded-full bg-white" /> : null}
      <Icon name="mic" size={touch ? 24 : 20} tone={talking ? 'onPrimary' : 'default'} />
      <Text variant="label" tone={talking ? 'onPrimary' : 'default'}>
        {labelOf(talking, pending)}
      </Text>
    </Interactive>
  );
}
