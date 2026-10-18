import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../../components/badge';
import { atLeast, useSizeClass } from '../../../design/size-class';
import {
  DndButton,
  MediaSlider,
  MemberLine,
  OfflineLine,
  RingButton,
  RingerMenu,
  RingerSegmented,
  TorchButton,
  type Layout,
} from './face-controls';
import type { PhoneControls } from './use-phone-face';

export function AccessChip(): ReactNode {
  return <Badge label="Needs access" tone="warning" icon="warning" />;
}

function Ring({
  controls,
  compact,
}: {
  readonly controls: PhoneControls;
  readonly compact: boolean;
}): ReactNode {
  return controls.access.view.canRing ? (
    <RingButton device={controls.device} ringing={controls.ringing} compact={compact} />
  ) : null;
}

function Torch({ controls }: { readonly controls: PhoneControls }): ReactNode {
  return controls.access.torch === 'unsupported' ? null : (
    <TorchButton device={controls.device} on={controls.torchOn} />
  );
}

function Ringer({
  controls,
  compact,
}: {
  readonly controls: PhoneControls;
  readonly compact: boolean;
}): ReactNode {
  return (
    <RingerMenu
      device={controls.device}
      ringerMode={controls.ringerMode}
      dnd={controls.dnd}
      access={controls.access}
      compact={compact}
    />
  );
}

function WideRinger({ controls }: { readonly controls: PhoneControls }): ReactNode {
  const roomy = atLeast(useSizeClass().width, 'expanded');
  if (!roomy || controls.access.dnd === 'needs_permission') {
    return <Ringer controls={controls} compact={false} />;
  }
  return (
    <>
      <RingerSegmented
        device={controls.device}
        ringerMode={controls.ringerMode}
        dnd={controls.dnd}
      />
      <DndButton device={controls.device} on={controls.dnd} blocked={false} />
    </>
  );
}

function OnlineRow({
  controls,
  layout,
}: {
  readonly controls: PhoneControls;
  readonly layout: Layout;
}): ReactNode {
  if (layout === 'm') {
    return (
      <>
        <Ring controls={controls} compact />
        <Torch controls={controls} />
        <Ringer controls={controls} compact />
      </>
    );
  }
  if (layout === 'w') {
    return (
      <>
        <WideRinger controls={controls} />
        <MediaSlider device={controls.device} volume={controls.mediaVolume} label />
        <Ring controls={controls} compact />
        <Torch controls={controls} />
      </>
    );
  }
  return (
    <>
      <Ringer controls={controls} compact={false} />
      <Ring controls={controls} compact={false} />
      <Torch controls={controls} />
    </>
  );
}

export const ControlRow = memo(function ControlRow({
  controls,
  layout,
}: {
  readonly controls: PhoneControls;
  readonly layout: Layout;
}): ReactNode {
  if (!controls.access.view.canAct) return <MemberLine device={controls.device} />;
  return (
    <View className="flex-row items-center gap-1.5" pointerEvents="box-none">
      {controls.online ? (
        <OnlineRow controls={controls} layout={layout} />
      ) : (
        <>
          <OfflineLine />
          <Ring controls={controls} compact />
        </>
      )}
    </View>
  );
});
