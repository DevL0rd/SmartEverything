import { Children, type ReactNode } from 'react';
import { View } from 'react-native';
import { SettingsPageScreen } from '../../../settings/settings-screen';

function LocationBlocks({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="flex-row flex-wrap items-start gap-section-gap">
      {Children.map(children, (block) => (
        <View className="min-w-0 grow shrink basis-96">{block}</View>
      ))}
    </View>
  );
}

export function LocationSettingsScreen(): ReactNode {
  return <SettingsPageScreen page="home/location" BlocksLayout={LocationBlocks} />;
}
