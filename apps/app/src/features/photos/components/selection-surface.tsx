import type { ReactNode } from 'react';
import { View } from 'react-native';

export function SelectionSurface({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View
      testID="photos-selection-bar"
      className="min-h-14 flex-row flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-primary-container py-1.5 pl-1 pr-2"
    >
      {children}
    </View>
  );
}

export function SelectionSummary({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="min-w-0 grow flex-row items-center gap-1.5">{children}</View>;
}

export function SelectionActions({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <View className="min-w-0 shrink flex-row flex-wrap items-center gap-x-2 gap-y-1 pl-1">
      {children}
    </View>
  );
}

export function SelectionGroup({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="min-w-0 shrink flex-row flex-wrap items-center gap-1.5">{children}</View>;
}

export function SelectionDivider(): ReactNode {
  return <View className="mx-0.5 h-6 w-px bg-on-primary-container/20" />;
}
