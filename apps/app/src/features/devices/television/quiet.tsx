import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Icon } from '../../../components/icon';
import { Text } from '../../../components/text';
import type { Television } from './use-television';

function Wake({ tv }: { readonly tv: Television }): ReactNode {
  const waiting = tv.view.mode === 'turning_on';
  return (
    <View className="flex-1 items-center justify-center gap-2">
      <View className="w-full max-w-60">
        <Button
          label={waiting ? 'Turning on…' : 'Turn on'}
          icon="power"
          variant="tonal"
          size="lg"
          disabled={waiting}
          onPress={tv.togglePower}
        />
      </View>
      <Text variant="caption" tone="variant" align="center">
        {waiting ? 'Waiting for the TV to answer' : 'Wakes through SmartThings'}
      </Text>
    </View>
  );
}

export function Quiet({ tv }: { readonly tv: Television }): ReactNode {
  switch (tv.view.mode) {
    case 'standby':
    case 'turning_on':
      return <Wake tv={tv} />;
    case 'updating':
      return (
        <QuietNote
          icon="refresh"
          tone="warning"
          text="The TV is installing an update"
          hint="Buttons come back when it restarts"
        />
      );
    case 'off_unreachable':
      return (
        <QuietNote
          icon="info"
          tone="variant"
          text="Can't turn on from here"
          hint="Needs a direct connection or an IR remote"
        />
      );
    case 'unreachable':
      return (
        <QuietNote
          icon="wifi"
          tone="warning"
          text="Check that the TV is plugged in and on Wi-Fi"
          hint="No other way to reach it yet"
        />
      );
    case 'on':
      return null;
  }
}

function QuietNote({
  icon,
  tone,
  text,
  hint,
}: {
  readonly icon: 'refresh' | 'info' | 'wifi';
  readonly tone: 'warning' | 'variant';
  readonly text: string;
  readonly hint: string;
}): ReactNode {
  return (
    <View className="flex-1 justify-center gap-1" pointerEvents="none">
      <View className="flex-row items-center gap-2">
        <Icon name={icon} size={16} tone={tone} />
        <Text variant="footnote" numberOfLines={2} className="flex-1">
          {text}
        </Text>
      </View>
      <Text variant="caption" tone="variant">
        {hint}
      </Text>
    </View>
  );
}
