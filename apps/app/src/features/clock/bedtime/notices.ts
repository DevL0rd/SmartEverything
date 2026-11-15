import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { clock24 } from '../../../format/time';
import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { nativeSleepPlayer } from './bedtime-data';
import { receiveSleepSound } from './sleep-sound-model';

export const BEDTIME_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['planner_bedtime'], (message, { live }) => {
    if (!live) return;
    notify({
      message: `Bedtime in ${String(message.minutesBefore)} min`,
      detail: `Bed at ${clock24(message.bedAt)}`,
    });
  }),
  noticeHandler(['planner_wind_down'], (message, { live }) => {
    if (!live) return;
    notify({
      message: 'Wind-down has started',
      detail: `Bed at ${clock24(message.bedAt)}, up at ${clock24(message.wakeAt)}`,
    });
  }),
  noticeHandler(['planner_sleep_sound'], (message, { live }) => {
    if (!live) return;
    background(receiveSleepSound(message, nativeSleepPlayer), 'planner.sleep_sound_failed', {
      action: message.action,
    });
  }),
];
