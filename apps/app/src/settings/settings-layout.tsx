import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { MasterDetail } from '../components/master-detail';
import { Text } from '../components/text';
import { screenPause } from '../app-shell/screen-pause';
import { useStackOptions } from '../app-shell/tab-stack';
import { useSizeClass } from '../design/size-class';
import { BuiltSettingsPages } from './availability';
import { SettingsNav } from './settings-nav';

function Master(): ReactNode {
  return (
    <ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-safe-offset-6">
      <Text variant="title-1" accessibilityRole="header" className="px-2">
        Settings
      </Text>
      <SettingsNav />
    </ScrollView>
  );
}

export function SettingsLayout(): ReactNode {
  const { split } = useSizeClass();
  const options = useStackOptions();
  const stack = (
    <Stack
      screenLayout={screenPause}
      screenOptions={split ? { ...options, animation: 'none' } : options}
    />
  );
  return (
    <BuiltSettingsPages>
      <MasterDetail master={<Master />} detail={<View className="flex-1">{stack}</View>} />
    </BuiltSettingsPages>
  );
}
