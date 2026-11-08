import type { ReactNode, RefObject } from 'react';
import type { View } from 'react-native';
import { useState } from 'react';
import type { PresentedCapability } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Segmented } from '../../../components/segmented';
import { Sheet } from '../../../components/sheet';
import type { Device } from '../../../store/state';
import { useLight, type LightView } from '../faces/use-light';
import { WhiteControl } from '../faces/white-control';
import { ColourBlock } from './colour-block';
import { useDeviceControl } from './use-device-control';

type Tab = 'white' | 'colour';

const TABS = [
  { value: 'white', label: 'White' },
  { value: 'colour', label: 'Colour' },
] as const;

function ColourTab({
  device,
  presented,
}: {
  readonly device: Device;
  readonly presented: PresentedCapability;
}): ReactNode {
  const control = useDeviceControl(device, presented);
  return <ColourBlock presented={presented} control={control} disabled={!device.online} />;
}

function firstTab(light: LightView): Tab {
  const { colour, temperature } = light.parts;
  return colour !== null && (temperature === null || light.state.mode === 'colour')
    ? 'colour'
    : 'white';
}

function SheetBody({ device }: { readonly device: Device }): ReactNode {
  const light = useLight(device);
  const [tab, setTab] = useState<Tab>(() => firstTab(light));
  const { colour, temperature } = light.parts;
  return (
    <>
      {colour !== null && temperature !== null ? (
        <Segmented
          label={`${light.name} colour mode`}
          options={TABS}
          value={tab}
          onChange={setTab}
        />
      ) : null}
      {tab === 'white' && temperature !== null ? (
        <WhiteControl light={light} presented={temperature} />
      ) : null}
      {tab === 'colour' && colour !== null ? (
        <ColourTab device={device} presented={colour} />
      ) : null}
    </>
  );
}

export function LightColourSheet({
  device,
  opener,
  onClose,
}: {
  readonly device: Device;
  readonly opener: RefObject<View | null> | null;
  readonly onClose: () => void;
}): ReactNode {
  const open = opener !== null;
  const [shown, setShown] = useState(open);
  if (open && !shown) {
    setShown(true);
  }
  if (!shown) {
    return null;
  }
  return (
    <Sheet
      subpage={opener === null ? false : { opener }}
      detents={['fit', 'full']}
      footer={<Button label="Done" onPress={onClose} />}
      open={open}
      onClose={onClose}
      title={`${device.label} colour`}
    >
      <SheetBody device={device} />
    </Sheet>
  );
}
