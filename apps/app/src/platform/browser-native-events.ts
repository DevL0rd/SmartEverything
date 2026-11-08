import {
  BROWSER_CONSOLE_EVENT,
  BROWSER_STATUS,
  type BrowserConsoleEvent,
  type BrowserStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { NativeSyntheticEvent } from 'react-native';
import { z } from 'zod';

export type NativeBrowserEvent = Pick<NativeSyntheticEvent<unknown>, 'nativeEvent'>;
const STATUS_EVENT = BROWSER_STATUS.extend({
  target: z.int().optional(),
  timeStamp: z.number().nonnegative().optional(),
});
const log = new Logger('app.native-browser');

export function nativeBrowserConsole(
  event: NativeBrowserEvent,
  browserId: string,
): BrowserConsoleEvent | null {
  const envelope = z.record(z.string(), z.unknown()).safeParse(event.nativeEvent);
  if (!envelope.success) {
    log.warn('browser.console_rejected', { browserId });
    return null;
  }
  const { target: _target, timeStamp: _timeStamp, ...data } = envelope.data;
  const parsed = BROWSER_CONSOLE_EVENT.safeParse(data);
  if (parsed.success && parsed.data.id === browserId) return parsed.data;
  log.warn('browser.console_rejected', { browserId });
  return null;
}

export function nativeBrowserStatus(event: NativeBrowserEvent, browserId: string): BrowserStatus {
  const parsed = STATUS_EVENT.safeParse(event.nativeEvent);
  if (!parsed.success) {
    log.error('browser.status_rejected', parsed.error, { browserId });
    return {
      id: browserId,
      url: '',
      loading: false,
      back: false,
      forward: false,
      problem: 'The Android browser sent an invalid status. Reopen the preview or update the app.',
    };
  }
  const { target: _target, timeStamp: _timeStamp, ...status } = parsed.data;
  return status;
}
