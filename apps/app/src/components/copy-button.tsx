import type { ReactNode } from 'react';
import * as Clipboard from 'expo-clipboard';
import { Logger } from '@smarteverything/logging';
import { IconButton } from './icon-button';
import { announceLocalCopy } from './local-copies';
import { notify } from './toast-store';

const log = new Logger('app.clipboard');

export function copyText(value: string, what: string): void {
  Clipboard.setStringAsync(value).then(
    () => {
      log.info('clipboard.copied', { what, length: value.length });
      announceLocalCopy(value);
      notify({ message: `${what} copied` });
    },
    (error: unknown) => {
      log.warn('clipboard.copy_failed', { what, length: value.length, reason: String(error) });
      notify({ message: `${what} was not copied`, error, tone: 'critical' });
    },
  );
}

export function CopyButton({
  value,
  label,
  what = label.replace(/^Copy /, ''),
}: {
  readonly value: string;
  readonly label: string;
  readonly what?: string;
}): ReactNode {
  return (
    <IconButton
      icon="copy"
      label={label}
      onPress={() => {
        copyText(value, what);
      }}
    />
  );
}
