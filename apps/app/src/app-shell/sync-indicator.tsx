import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Banner } from '../components/banner';
import { Icon } from '../components/icon';
import { Text } from '../components/text';
import { useSyncStatus } from '../store/selectors';

interface SyncLabel {
  readonly label: string;
  readonly tone: 'warning' | 'critical';
  readonly busy: boolean;
}

const OUTDATED: SyncLabel = {
  label: 'Update the app to see everything',
  tone: 'warning',
  busy: false,
};

function useSyncLabel(): SyncLabel | null {
  const sync = useSyncStatus();
  switch (sync.status) {
    case 'live':
      return sync.outdated.length === 0 ? null : OUTDATED;
    case 'refused':
      return { label: 'Your server refused this device', tone: 'critical', busy: false };
    case 'interrupted':
      return {
        label: sync.problem === null ? 'Reconnecting…' : 'Can’t reach your server',
        tone: sync.problem === null ? 'warning' : 'critical',
        busy: sync.problem === null,
      };
    case 'connecting':
    case 'loading':
      return { label: 'Connecting…', tone: 'warning', busy: true };
  }
}

export function SyncRow(): ReactNode {
  const shown = useSyncLabel();
  if (shown === null) {
    return null;
  }
  return (
    <View accessibilityLiveRegion="polite" className="h-10 flex-row items-center gap-3 px-4">
      {shown.busy ? (
        <ActivityIndicator size="small" colorClassName="accent-warning" />
      ) : (
        <Icon name={shown.tone === 'critical' ? 'wifi' : 'download'} size={20} tone={shown.tone} />
      )}
      <Text variant="footnote" tone={shown.tone} numberOfLines={1}>
        {shown.label}
      </Text>
    </View>
  );
}

export function SyncBanner(): ReactNode {
  const shown = useSyncLabel();
  if (shown === null) {
    return null;
  }
  return (
    <View className="px-gutter pt-safe">
      <Banner tone={shown.tone} title={shown.label} />
    </View>
  );
}
