import type { ReactNode } from 'react';
import { useState } from 'react';
import { Image, View } from 'react-native';
import type { MediaSize } from '@smarteverything/domain';
import { Icon } from '../../../components/icon';
import { useDevice } from '../../../store/selectors';
import { useSnapshotLink } from './snapshot-link';

export interface CameraSnapshotProps {
  readonly deviceId: string;
  readonly label: string;
  readonly size?: MediaSize;
  readonly placeholder?: boolean;
}

function Placeholder(): ReactNode {
  return (
    <View className="absolute inset-0 items-center justify-center bg-surface-2">
      <Icon name="cameras" size={32} tone="faint" />
    </View>
  );
}

export function CameraSnapshot({
  deviceId,
  label,
  size = 'thumb',
  placeholder = true,
}: CameraSnapshotProps): ReactNode {
  const online = useDevice(deviceId)?.online === true;
  const link = useSnapshotLink(deviceId, size, online);
  const [broken, setBroken] = useState<string | null>(null);
  const uri = link.data?.url ?? null;
  if (uri === null || broken === uri) {
    return placeholder ? <Placeholder /> : null;
  }
  return (
    <View className="absolute inset-0 bg-surface-2">
      <Image
        source={{ uri }}
        accessibilityLabel={`Latest picture from ${label}`}
        resizeMode="cover"
        className="absolute inset-0 h-full w-full"
        onError={() => {
          setBroken(uri);
        }}
      />
    </View>
  );
}
