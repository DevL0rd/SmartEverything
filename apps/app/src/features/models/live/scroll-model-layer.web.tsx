import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function ScrollModelLayer({
  children,
  style,
}: {
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}): ReactNode {
  return style === undefined ? children : <View style={style}>{children}</View>;
}
