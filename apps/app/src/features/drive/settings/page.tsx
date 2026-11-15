import type { ReactNode } from 'react';
import { View } from 'react-native';

export function DriveSettingsSection({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="gap-4">{children}</View>;
}
