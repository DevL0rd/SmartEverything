import { useRef, useState, type ReactNode } from 'react';
import type { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useKeyboard, type KeyPress } from '../../../app-shell/shortcuts';
import { CompactPickerControl } from '../components/compact-picker-control';
import { useCommandTransient } from '../commands/transient';
import { focusModelTrigger } from '../chats/model-menu-anchor';
import type { AccessModel } from './access-model';
import { AccessPanel } from './access-panel';
import { accessPillLabel } from './ai-access';

function isAccessChord(press: KeyPress): boolean {
  return press.command && press.shift && press.key.toLowerCase() === 'l';
}

export function AccessControl({ model }: { readonly model: AccessModel }): ReactNode {
  const ref = useRef<View>(null);
  const { operation } = useLocalSearchParams<{ operation?: string }>();
  const [shown, setShown] = useState(false);
  const routed = operation === 'access';
  const open = shown || routed;
  const hide = (): void => {
    setShown(false);
    if (routed) router.setParams({ operation: undefined });
  };
  const close = (): void => {
    hide();
    focusModelTrigger(ref);
  };
  const dismissCommands = useCommandTransient(hide);
  const show = (): void => {
    dismissCommands();
    setShown(true);
  };
  useKeyboard((press): boolean => {
    if (!isAccessChord(press)) return false;
    if (open) close();
    else show();
    return true;
  });
  const { pill } = model;
  return (
    <>
      <CompactPickerControl
        anchorRef={ref}
        kind="access"
        label={accessPillLabel(pill, model.nextTurn)}
        value={pill.label}
        icon={pill.icon}
        unrestricted={pill.tone === 'caution'}
        pending={model.nextTurn}
        onPress={show}
      />
      <AccessPanel anchorRef={ref} open={open} onClose={close} model={model} />
    </>
  );
}
