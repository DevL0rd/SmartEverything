import { usePluginScreen } from '../shared/plugin-log';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { List } from '../../components/section';
import { Sheet } from '../../components/sheet';
import { Text } from '../../components/text';
import { notify } from '../../components/toast-store';
import { PluginActionRow } from '../shared/plugin-action';
import { useAdGuardTools } from './adguard-data';
import { PAUSE_CHOICES, pausedMessage, type PauseChoice } from './model/pause-model';
import { background } from '@smarteverything/logging';

function usePauseFor(onClose: () => void, onReopen: () => void): (choice: PauseChoice) => void {
  const tools = useAdGuardTools();
  return (choice) => {
    onClose();
    background(
      tools
        .run('pause_protection', { minutes: choice.minutes }, 'Ad blocking wasn’t paused')
        .then((done) => {
          if (done !== null) {
            notify({
              message: pausedMessage(choice),
              action: { label: 'Change', onPress: onReopen },
            });
          }
        }),
      'tools.run_failed',
    );
  };
}

function PauseChoices({
  pauseFor,
}: {
  readonly pauseFor: (choice: PauseChoice) => void;
}): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2">
      {PAUSE_CHOICES.map((choice) => (
        <Button
          key={choice.minutes}
          label={choice.chip}
          variant="tonal"
          size="lg"
          grow
          onPress={() => {
            pauseFor(choice);
          }}
        />
      ))}
    </View>
  );
}

export function PauseSheet({
  open,
  onClose,
  onReopen,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onReopen: () => void;
}): ReactNode {
  usePluginScreen('adguard', 'PauseSheet');
  const tools = useAdGuardTools();
  const pauseFor = usePauseFor(onClose, onReopen);
  return (
    <Sheet open={open} onClose={onClose} title="Pause ad blocking">
      <View className="gap-4">
        <Text variant="callout" tone="variant">
          Pause for how long?
        </Text>
        <PauseChoices pauseFor={pauseFor} />
        <List>
          <PluginActionRow
            title="Until I turn it back on"
            icon="power"
            destructive
            onPress={() => {
              onClose();
              return tools.run('turn_off_protection', {}, 'Ad blocking wasn’t switched off');
            }}
          />
        </List>
      </View>
    </Sheet>
  );
}
