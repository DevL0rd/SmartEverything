import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { IconWell } from '../../../components/icon-well';
import { Text } from '../../../components/text';
import { useLocalPref } from '../../../store/local-prefs';
import { turnTalkOn } from '../data/talk-device';
import { useTalkEngine } from '../engine/engine-state';
import { background } from '@smarteverything/logging';

interface StatusCopy {
  readonly title: string;
  readonly body: string;
  readonly warning: boolean;
  readonly action: boolean;
}

function useCopy(): StatusCopy | null {
  const enabled = useLocalPref('talkEnabled');
  const engine = useTalkEngine();
  if (!enabled) {
    return {
      title: 'Walkie-talkie is off',
      body: 'Turn it on to hear your channels and talk, even with the app in the background.',
      warning: false,
      action: true,
    };
  }
  if (engine.link === 'unsupported' || engine.link === 'offline') {
    return {
      title: 'Walkie-talkie can’t connect',
      body: engine.problem ?? 'Check that your server is running.',
      warning: true,
      action: false,
    };
  }
  return null;
}

export function DeviceStatus(): ReactNode {
  const copy = useCopy();
  if (copy === null) {
    return null;
  }
  return (
    <Card tone={copy.warning ? 'attention' : 'default'}>
      <View className="flex-row items-start gap-3">
        <IconWell
          icon={copy.warning ? 'warning' : 'power'}
          colour={copy.warning ? 'warning' : 'primary'}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text variant="body-strong">{copy.title}</Text>
          <Text variant="callout" tone="variant">
            {copy.body}
          </Text>
        </View>
      </View>
      {copy.action ? (
        <View className="mt-3 items-end">
          <Button
            label="Turn on"
            icon="power"
            onPress={() => {
              background(turnTalkOn(), 'talk_on.turn_failed');
            }}
          />
        </View>
      ) : null}
    </Card>
  );
}
