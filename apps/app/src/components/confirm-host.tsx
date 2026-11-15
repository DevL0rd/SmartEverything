import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useValue } from '../design/external-store';
import { ThemeScope } from '../design/theme-scope';
import { warningBuzz } from '../platform/haptics';
import { Button } from './button';
import {
  pendingConfirm,
  settleAlternate,
  settleConfirm,
  type PendingConfirm,
} from './confirm-store';
import { DialogFrame } from './dialog-frame';
import { Text } from './text';
import { TextField } from './text-field';

interface FooterProps {
  readonly pending: PendingConfirm;
  readonly blocked: boolean;
  readonly close: (accepted: boolean) => void;
  readonly cancel: RefObject<View | null>;
}

function ConfirmButton({ pending, blocked, close }: Omit<FooterProps, 'cancel'>): ReactNode {
  return (
    <Button
      label={pending.confirmLabel}
      variant={pending.tone === 'destructive' ? 'destructive' : 'filled'}
      disabled={blocked}
      onPress={() => {
        close(true);
      }}
    />
  );
}

function ChoiceFooter({
  alternate,
  pending,
  blocked,
  close,
  cancel,
}: FooterProps & { readonly alternate: string }): ReactNode {
  return (
    <View className="flex-1 gap-2">
      <ConfirmButton pending={pending} blocked={blocked} close={close} />
      <Button label={alternate} variant="outlined" disabled={blocked} onPress={settleAlternate} />
      <Button
        ref={cancel}
        label={pending.cancelLabel ?? 'Cancel'}
        variant="text"
        onPress={() => {
          close(false);
        }}
      />
    </View>
  );
}

function Footer({ pending, blocked, close, cancel }: FooterProps): ReactNode {
  if (pending.alternateLabel !== undefined)
    return (
      <ChoiceFooter
        alternate={pending.alternateLabel}
        pending={pending}
        blocked={blocked}
        close={close}
        cancel={cancel}
      />
    );
  return (
    <>
      <Button
        ref={cancel}
        label={pending.cancelLabel ?? 'Cancel'}
        variant="text"
        onPress={() => {
          close(false);
        }}
      />
      <ConfirmButton pending={pending} blocked={blocked} close={close} />
    </>
  );
}

function ConfirmDialog({ pending }: { readonly pending: PendingConfirm }): ReactNode {
  const [typed, setTyped] = useState('');
  const cancel = useRef<View>(null);
  const blocked = pending.typed !== undefined && typed.trim() !== pending.typed;
  const close = (accepted: boolean): void => {
    if (accepted && pending.tone === 'destructive') {
      warningBuzz();
    }
    settleConfirm(accepted);
  };
  return (
    <DialogFrame
      open
      onClose={() => {
        close(false);
      }}
      label={pending.title}
      title={pending.title}
      kind="dialog"
      {...(pending.typed === undefined ? { initialFocus: cancel } : {})}
      footer={<Footer pending={pending} blocked={blocked} close={close} cancel={cancel} />}
    >
      <View className="gap-4">
        {pending.body === undefined ? null : (
          <Text variant="body" tone="variant">
            {pending.body}
          </Text>
        )}
        {pending.typed === undefined ? null : (
          <TextField
            label={`Type ${pending.typed} to confirm`}
            value={typed}
            onChange={setTyped}
            kind="code"
            focusOnMount
          />
        )}
      </View>
    </DialogFrame>
  );
}

export function ConfirmHost(): ReactNode {
  const pending = useValue(pendingConfirm);
  if (pending === null) return null;
  const dialog = <ConfirmDialog key={pending.id} pending={pending} />;
  return pending.theme === undefined ? (
    dialog
  ) : (
    <ThemeScope theme={pending.theme}>{dialog}</ThemeScope>
  );
}
