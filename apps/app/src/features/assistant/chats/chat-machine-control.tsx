import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { focusView } from '../../../components/focus-request';
import { IconButton } from '../../../components/icon-button';
import { ModelPanel } from '../picker/panel/model-panel';
import { useEngineAccessory, useMachineSwitchPending } from './engine-accessories';

export function ChatMachineControl({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const ref = useRef<View>(null);
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
  return (
    <>
      <IconButton
        ref={ref}
        icon={switching ? 'loader' : 'monitor'}
        label={switching ? 'Switching machine. Show machines' : 'Choose machine'}
        selected={open}
        onPress={(): void => {
          setShown(true);
        }}
      />
      {open && accessory !== null ? (
        <ModelPanel
          anchorRef={ref}
          engine={chat.engine}
          onChange={accessory.change}
          blocked={false}
          initialPage="machine"
          close={close}
          machineInHeader
        />
      ) : null}
    </>
  );
}
