import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SettingsFrame } from '../../../settings/settings-frame';
import { SettingsPageBody } from '../../../settings/settings-page';

export function AboutScreen(): ReactNode {
  return (
    <SettingsFrame page="about" contentWidth="detail">
      <View className="gap-section-gap web:flex-row web:flex-wrap web:items-end web:*:min-w-0 web:*:shrink web:*:grow web:*:basis-96">
        <SettingsPageBody page="about" />
      </View>
    </SettingsFrame>
  );
}
