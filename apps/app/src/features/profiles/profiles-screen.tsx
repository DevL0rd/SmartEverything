import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { SettingsPageScreen } from '../../settings/settings-screen';
import { PROFILE_SCALE_SETTING } from './settings';

function ProfileBlocks({ children }: { readonly children: ReactNode }): ReactNode {
  const people: ReactNode[] = [];
  const scale: ReactNode[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.key === PROFILE_SCALE_SETTING) {
      scale.push(child);
    } else {
      people.push(child);
    }
  });
  return (
    <View className="gap-section-gap web:flex-row web:flex-wrap web:items-start">
      <View className="min-w-0 max-w-reading gap-section-gap web:shrink web:grow web:basis-96">
        {people}
      </View>
      {scale.length === 0 ? null : (
        <View className="min-w-0 max-w-dialog web:shrink web:grow web:basis-80">{scale}</View>
      )}
    </View>
  );
}

export function ProfilesScreen(): ReactNode {
  return <SettingsPageScreen page="profiles" contentWidth="detail" BlocksLayout={ProfileBlocks} />;
}
