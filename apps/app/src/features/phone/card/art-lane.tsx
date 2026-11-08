import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { WIDE_VISUAL_PX, WideArt, type WideClass } from '../../devices';
import { PhoneArt } from './phone-art';
import type { PhoneFaceData } from './use-phone-face';

export function ArtLane({
  cls,
  data,
  children,
}: {
  readonly cls: WideClass;
  readonly data: PhoneFaceData;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View
      className={cn('flex-1 flex-row', cls === 'm' ? 'gap-3' : 'gap-4')}
      pointerEvents="box-none"
    >
      <WideArt cls={cls}>
        <PhoneArt device={data.device} foldable={data.access.fold} px={WIDE_VISUAL_PX[cls]} />
      </WideArt>
      <View className="min-w-0 flex-1 gap-1" pointerEvents="box-none">
        {children}
      </View>
    </View>
  );
}
