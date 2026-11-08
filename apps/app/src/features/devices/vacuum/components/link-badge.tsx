import type { ReactNode } from 'react';
import type { AppHref } from '../../../../components/app-href';
import { View } from 'react-native';
import { Icon } from '../../../../components/icon';
import { Interactive } from '../../../../components/interactive';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import type { LinkNotice } from '../model/room-links';
import { VACUUM_SHOW_PARAM } from '../page-model';

export function vacuumRoomsHref(deviceId: string): AppHref {
  return { pathname: '/device/[deviceId]', params: { deviceId, [VACUUM_SHOW_PARAM]: 'rooms' } };
}

export function LinkCount({ notice }: { readonly notice: LinkNotice }): ReactNode {
  return (
    <View className="h-7 flex-row items-center gap-1 rounded-full border-hairline border-warning/40 bg-warning/14 px-2">
      <Icon name="unlink" size={16} tone="warning" />
      <Text variant="caption" tone="warning" className="tabular">
        {String(notice.count)}
      </Text>
    </View>
  );
}

export function LinkBadge({
  deviceId,
  notice,
  className,
  onOpen,
}: {
  readonly deviceId: string;
  readonly notice: LinkNotice | null;
  readonly className?: string;
  readonly onOpen?: () => void;
}): ReactNode {
  if (notice === null) {
    return null;
  }
  const target = onOpen === undefined ? { href: vacuumRoomsHref(deviceId) } : { onPress: onOpen };
  return (
    <Interactive
      role={onOpen === undefined ? 'link' : 'button'}
      label={notice.label}
      {...target}
      className={cn('min-h-touch-min min-w-12 items-center justify-center', className)}
      layerClassName="rounded-full"
    >
      <LinkCount notice={notice} />
    </Interactive>
  );
}
