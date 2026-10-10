import type { ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { IconButton } from './icon-button';
import { notify } from './toast-store';

export function copyText(value: string, what: string): void {
  Clipboard.setStringAsync(value).then(
    () => {
      notify({ message: `${what} copied` });
    },
    (error: unknown) => {
      notify({ message: `${what} was not copied`, error, tone: 'critical' });
    },
  );
}

export function CopyButton({
  value,
  label,
}: {
  readonly value: string;
  readonly label: string;
}): ReactNode {
  return (
    <IconButton
      icon="copy"
      label={label}
      onPress={() => {
        copyText(value, label.replace(/^Copy /, ''));
      }}
    />
  );
}
