import type { ReactNode } from 'react';
import { View } from 'react-native';
import { anchorKey } from '../../../components/highlight-keys';
import { useHighlightAnchor } from '../../../components/use-highlight-anchor';

export function Anchored({
  deviceId,
  id,
  label,
  children,
}: {
  readonly deviceId: string;
  readonly id: string;
  readonly label: string;
  readonly children: ReactNode;
}): ReactNode {
  const anchor = useHighlightAnchor(anchorKey.capability(deviceId, id), label);
  return <View {...anchor}>{children}</View>;
}
