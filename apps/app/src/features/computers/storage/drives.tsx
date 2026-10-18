import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { Skeleton } from '../../../components/skeleton';
import { sameJson } from '../../../store/same-json';
import type { Device } from '../../../store/state';
import { useComputerSelect } from '../data/computer-metrics';
import { DiskCard } from './disk-card';
import { diskFactsOf } from './storage-model';

export function Drives({ device }: { readonly device: Device }): ReactNode {
  const disks = useComputerSelect(
    device.id,
    (parts) => (parts.disks === undefined ? null : diskFactsOf(parts.disks.disks)),
    sameJson,
  );
  if (disks === null) return <Skeleton shape="block" className="h-40" />;
  if (disks.length === 0) {
    return (
      <EmptyState icon="layers" title="No drives" body={`${device.label} reports no drives.`} />
    );
  }
  return (
    <View className="gap-4">
      {disks.map((disk) => (
        <DiskCard key={disk.mount} deviceId={device.id} disk={disk} offline={!device.online} />
      ))}
    </View>
  );
}
