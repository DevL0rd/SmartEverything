import type { ReactNode } from 'react';
import { View } from 'react-native';

export const SERVER_PANEL = 'min-w-0 max-w-reading grow shrink basis-96';

export function ServerPanels({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="flex-row flex-wrap items-start gap-section-gap">{children}</View>;
}
