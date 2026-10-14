import { BROWSER_STATUS, type BrowserStatus } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { NativeSyntheticEvent } from 'react-native';
import { z } from 'zod';

export type NativeBrowserEvent = Pick<NativeSyntheticEvent<unknown>, 'nativeEvent'>;
const STATUS_EVENT = BROWSER_STATUS.extend({
  target: z.int().optional(),
  timeStamp: z.number().nonnegative().optional(),
});
const log = new Logger('app.native-browser');

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
