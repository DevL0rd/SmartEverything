import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../../components/badge';
import { Text } from '../../../../components/text';
import type { SyncState } from './draft-sync-model';
import { chipHint, chipLook } from './sync-copy';

export function DraftStatusChip({ state }: { readonly state: SyncState }): ReactNode {
  const look = chipLook(state);
  const hint = chipHint(state);
  return (
    <View accessibilityRole="text" accessibilityLiveRegion="polite" className="min-w-0 gap-0.5">
      <Badge label={look.label} tone={look.tone} icon={look.icon} />
      {hint === null ? null : (
        <Text variant="caption" tone="variant">
          {hint}
        </Text>
      )}
    </View>
  );
}
