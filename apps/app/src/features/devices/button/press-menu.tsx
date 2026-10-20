import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { background } from '@smarteverything/logging';
import { pressDeviceButton } from '../../../api/devices';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { useAnchoredMenu, type MenuItem } from '../../../components/menu';
import { notifyFailure } from '../../../components/toast-store';
import { GESTURE_ACTIONS, type ButtonGesture } from '../../device-visuals';
import { GESTURES, GESTURE_WORDS, meaningFor, type Meaning } from './press-model';

function pressItems(
  deviceId: string,
  meaning: readonly Meaning[],
  send: (deviceId: string, gesture: ButtonGesture) => void,
): readonly MenuItem[] {
  return GESTURES.map((gesture) => {
    const runs = meaningFor(meaning, gesture);
    return {
      label: GESTURE_WORDS[gesture],
      description:
        runs.length === 0 ? 'Does nothing yet' : `Runs ${runs.map((run) => run.name).join(', ')}`,
      icon: 'play',
      onPress: (): void => {
        send(deviceId, gesture);
      },
    };
  });
}

function sendPress(deviceId: string, gesture: ButtonGesture): void {
  background(
    pressDeviceButton(deviceId, GESTURE_ACTIONS[gesture]).then(
      () => undefined,
      notifyFailure('The press didn’t go through'),
    ),
    'device.press_failed',
  );
}

export function PressMenu({
  deviceId,
  meaning,
}: {
  readonly deviceId: string;
  readonly meaning: readonly Meaning[];
}): ReactNode {
  const router = useRouter();
  const idle = meaning.length === 0;
  const { ref, open, menu } = useAnchoredMenu(
    pressItems(deviceId, meaning, sendPress),
    'Press this button',
  );
  if (idle) {
    return (
      <Button
        label="Make it do something"
        variant="tonal"
        icon="plus"
        onPress={() => {
          router.push(href.automationNew());
        }}
      />
    );
  }
  return (
    <View ref={ref} collapsable={false}>
      <Button label="Press" variant="tonal" icon="chevronDown" onPress={open} />
      {menu}
    </View>
  );
}
