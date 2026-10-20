import type { BrushStateView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { useMinute } from '../../../store/clock';
import { syncedChip } from '../model/brush-model';
import { BrushStateBadge } from './state-badge';

function BatteryChip({ view }: { readonly view: BrushStateView }): ReactNode {
  const { percent, low, charging } = view.battery;
  if (percent === null) {
    return null;
  }
  return (
    <Badge
      label={`Battery ${String(Math.round(percent))}%${charging ? ', charging' : ''}`}
      tone={low && !charging ? 'warning' : 'neutral'}
      icon={charging ? 'plug' : 'battery'}
    />
  );
}

function HeadChip({ view }: { readonly view: BrushStateView }): ReactNode {
  const { head } = view;
  if (view.profile.head === 'none') {
    return null;
  }
  if (head.state === 'missing') {
    return <Badge label="No brush head" tone="warning" icon="warning" />;
  }
  if (head.wearPercent === null) {
    return null;
  }
  return (
    <Badge
      label={`Head ${String(Math.round(head.wearPercent))}% worn`}
      tone={head.wearPercent >= 90 ? 'warning' : 'neutral'}
    />
  );
}

export function HeroChips({
  deviceId,
  view,
  linkShown = false,
}: {
  readonly deviceId: string;
  readonly view: BrushStateView;
  readonly linkShown?: boolean;
}): ReactNode {
  const chip = syncedChip(view, useMinute());
  const synced = linkShown ? null : chip;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <BrushStateBadge deviceId={deviceId} view={view} />
      {synced === null ? null : (
        <Badge label={synced} tone={view.link.phase === 'linked' ? 'positive' : 'neutral'} />
      )}
      <BatteryChip view={view} />
      <HeadChip view={view} />
    </View>
  );
}
