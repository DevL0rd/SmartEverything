import { Children, type ReactNode } from 'react';
import { View } from 'react-native';
import { isNative } from '../../../design/platform';
import { SettingsPageScreen } from '../../../settings/settings-screen';

function AssistantSettingsBlocks({ children }: { readonly children: ReactNode }): ReactNode {
  if (isNative()) return children;
  return (
    <View className="gap-section-gap web:block web:columns-(--spacing-picker)">
      {Children.map(children, (block) => (
        <View className="min-w-0 max-w-reading web:break-inside-avoid web:not-last:pb-section-gap">
          {block}
        </View>
      ))}
    </View>
  );
}

export function AssistantSettingsScreen(): ReactNode {
  return (
    <SettingsPageScreen
      page="assistant"
      contentWidth={isNative() ? 'reading' : 'full'}
      BlocksLayout={AssistantSettingsBlocks}
    />
  );
}
