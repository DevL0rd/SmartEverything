import { memo, type ReactNode } from 'react';
import { Badge } from '../../../components/badge';
import { ActionBand } from '../../../components/widget-board/action-band';
import {
  MediaSlider,
  MemberLine,
  OfflineLine,
  RingButton,
  RingerMenu,
  TorchButton,
  type Layout,
} from './face-controls';
import { PhoneMenu } from './face-header';
import type { PhoneControls, PhoneFaceData } from './use-phone-face';

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

function OnlineItems({
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
        <Ringer controls={controls} compact={false} />
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

const ControlItems = memo(function ControlItems({
  controls,
  layout,
}: {
  readonly controls: PhoneControls;
  readonly layout: Layout;
}): ReactNode {
  if (!controls.access.view.canAct) return <MemberLine device={controls.device} />;
  if (controls.online) return <OnlineItems controls={controls} layout={layout} />;
  return (
    <>
      <OfflineLine />
      <Ring controls={controls} compact />
    </>
  );
});

export function PhoneBand({
  data,
  layout,
}: {
  readonly data: PhoneFaceData;
  readonly layout: Layout;
}): ReactNode {
  return (
    <ActionBand>
      <ControlItems controls={data.controls} layout={layout} />
      <PhoneMenu data={data} />
    </ActionBand>
  );
}
