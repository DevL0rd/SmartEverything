import type { ReactNode, RefObject } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useValue } from '../design/external-store';
import { warningBuzz } from '../platform/haptics';
import { Button } from './button';
import { pendingConfirm, settleConfirm, type PendingConfirm } from './confirm-store';
import { DialogFrame } from './dialog-frame';
import { Text } from './text';
import { TextField } from './text-field';

function Footer({
  pending,
  blocked,
  close,
  cancel,
}: {
  readonly pending: PendingConfirm;
  readonly blocked: boolean;
  readonly close: (accepted: boolean) => void;
  readonly cancel: RefObject<View | null>;
}): ReactNode {
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
      <Button
        label={pending.confirmLabel}
        variant={pending.tone === 'destructive' ? 'destructive' : 'filled'}
        disabled={blocked}
        onPress={() => {
          close(true);
        }}
      />
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
  return pending === null ? null : <ConfirmDialog key={pending.id} pending={pending} />;
}
