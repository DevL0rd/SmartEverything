import type { ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

export interface LayoutPhoneProps {
  readonly top: ReactNode;
  readonly banner: ReactNode;
  readonly body: ReactNode;
  readonly bottom: ReactNode;
  readonly inset: number;
  readonly onBodyLayout: (event: LayoutChangeEvent) => void;
}

function insetOf(inset: number): { readonly marginBottom: number } {
  return { marginBottom: inset };
}

export function LayoutPhone({
  top,
  banner,
  body,
  bottom,
  inset,
  onBodyLayout,
}: LayoutPhoneProps): ReactNode {
  return (
    <View className="relative min-h-0 flex-1 bg-surface-1 pt-safe">
      {top}
      {banner}
      <View className="min-h-0 flex-1" style={insetOf(inset)} onLayout={onBodyLayout}>
        {body}
      </View>
      {bottom}
    </View>
  );
}
