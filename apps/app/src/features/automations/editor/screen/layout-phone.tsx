import type { ReactNode } from 'react';
import { View } from 'react-native';

export interface LayoutPhoneProps {
  readonly banner: ReactNode;
  readonly body: ReactNode;
  readonly bottom: ReactNode;
  readonly inset: number;
}

function insetOf(inset: number): { readonly marginBottom: number } {
  return { marginBottom: inset };
}

export function LayoutPhone({ banner, body, bottom, inset }: LayoutPhoneProps): ReactNode {
  return (
    <View className="relative min-h-0 flex-1 bg-surface-1">
      {banner}
      <View className="min-h-0 flex-1" style={insetOf(inset)}>
        {body}
      </View>
      {bottom}
    </View>
  );
}
