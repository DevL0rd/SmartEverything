import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import type { BackupDeviceState } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { usePhotoBackupState } from '../data';
import { currentFirst, phoneViewOf, type LiveProgress, type PhoneView } from './phones-model';

function DeviceLine({ view }: { readonly view: PhoneView }): ReactNode {
  const label = `${view.title} ${view.share} backed up`;
  return (
    <View className="flex-row items-center gap-3 border-t border-outline-variant px-4 py-3">
      <View className="size-10 items-center justify-center rounded-full bg-surface-3">
        <Icon
          name={view.platform === 'desktop' ? 'monitor' : 'smartphone'}
          size={20}
          tone={view.current ? 'primary' : 'variant'}
        />
      </View>
      <View className="min-w-0 flex-1 gap-1.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="body-strong" numberOfLines={1} className="shrink">
            {view.title}
          </Text>
          {view.current ? <Badge label="This device" tone="info" /> : null}
          <View className="ml-auto">
            <Badge label={view.badge.label} tone={view.badge.tone} />
          </View>
        </View>
        <ProgressBar progress={view.coverage} colour={view.colour} label={label} />
        <View className="flex-row items-center gap-2">
          <Text
            variant="caption"
            tone="variant"
            numberOfLines={1}
            className="min-w-0 flex-1 tabular-nums"
          >
            {view.detail}
          </Text>
          <Text variant="caption" tone="variant" className="tabular-nums">
            {view.share}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function deviceViewsOf(
  states: readonly BackupDeviceState[],
  live: LiveProgress,
  currentDeviceId: string | null,
): readonly PhoneView[] {
  return currentFirst(
    states.map((state) =>
      phoneViewOf(state, {
        live: live.devices.get(state.device.deviceId),
        current: state.device.deviceId === currentDeviceId,
      }),
    ),
  );
}

function NoDevices(): ReactNode {
  return (
    <View className="border-t border-outline-variant px-2 py-2">
      <EmptyState
        compact
        icon="smartphone"
        title="No devices back up yet"
        body="Open Photos settings on your phone or computer and turn on Back up this device."
      />
    </View>
  );
}

interface DevicesProps {
  readonly live: LiveProgress;
  readonly currentDeviceId: string | null;
}

function DeviceList({
  states,
  live,
  currentDeviceId,
}: DevicesProps & { readonly states: readonly BackupDeviceState[] }): ReactNode {
  const views = deviceViewsOf(states, live, currentDeviceId);
  if (views.length === 0) return <NoDevices />;
  return views.map((view) => <DeviceLine key={view.key} view={view} />);
}

function DevicesBody({ live, currentDeviceId }: DevicesProps): ReactNode {
  const query = usePhotoBackupState();
  if (query.data !== undefined) {
    return <DeviceList states={query.data.devices} live={live} currentDeviceId={currentDeviceId} />;
  }
  if (query.isError) {
    return (
      <View className="px-4 pb-4">
        <ErrorState
          error={query.error}
          retry={() => {
            background(query.refetch(), 'photos.backup.devices_refetch_failed');
          }}
        />
      </View>
    );
  }
  return (
    <View aria-busy className="gap-2 px-4 pb-4">
      <Skeleton shape="line" className="h-14" />
      <Skeleton shape="line" className="h-14" />
    </View>
  );
}

export function DevicesCard({ live, currentDeviceId }: DevicesProps): ReactNode {
  return (
    <Card
      title="All devices"
      icon="layers"
      padding="none"
      metadata={
        <Text variant="caption" tone="variant">
          Each device sets its own backup
        </Text>
      }
    >
      <DevicesBody live={live} currentDeviceId={currentDeviceId} />
    </Card>
  );
}
