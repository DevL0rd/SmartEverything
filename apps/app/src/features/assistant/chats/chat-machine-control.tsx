import { useRef, useState, type ReactNode, type RefObject } from 'react';
import type { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { focusView } from '../../../components/focus-request';
import { IconButton } from '../../../components/icon-button';
import type { MenuItem } from '../../../components/menu';
import { ModelPanel } from '../picker/panel/model-panel';
import { useEngineAccessory, useMachineSwitchPending } from './engine-accessories';

export interface MachineControl {
  readonly open: boolean;
  readonly label: string;
  readonly switching: boolean;
  readonly show: () => void;
  readonly panel: ReactNode;
}

export function useMachineRef(): RefObject<View | null> {
  return useRef<View>(null);
}

export function useMachineControl(chat: AiChatRow, ref: RefObject<View | null>): MachineControl {
  const [shown, setShown] = useState(false);
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  const routed = operation === 'device' && chat.engine.kind === 'dsh';
  const open = shown || routed;
  const accessory = useEngineAccessory();
  const switching = useMachineSwitchPending(chat);
  const close = (): void => {
    setShown(false);
    if (routed) router.setParams({ work: undefined, operation: undefined });
    focusView(ref.current);
  };
  return {
    open,
    switching,
    label: switching ? 'Switching machine. Show machines' : 'Choose machine',
    show: (): void => {
      setShown(true);
    },
    panel:
      open && accessory !== null ? (
        <ModelPanel
          anchorRef={ref}
          engine={chat.engine}
          onChange={accessory.change}
          blocked={false}
          initialPage="machine"
          close={close}
          machineInHeader
        />
      ) : null,
  };
}

export function machineMenuItem(control: MachineControl): MenuItem {
  return {
    id: 'machine',
    label: control.label,
    icon: control.switching ? 'loader' : 'monitor',
    onPress: control.show,
  };
}

export function MachineButton({
  control,
  anchor,
}: {
  readonly control: MachineControl;
  readonly anchor: RefObject<View | null>;
}): ReactNode {
  return (
    <IconButton
      ref={anchor}
      icon={control.switching ? 'loader' : 'monitor'}
      label={control.label}
      selected={control.open}
      onPress={control.show}
    />
  );
}
