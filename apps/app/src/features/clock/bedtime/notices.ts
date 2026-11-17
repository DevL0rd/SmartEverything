import { background } from '@smarteverything/logging';
import { notify } from '../../../components/toast-store';
import { clockIn } from '../../../format/time';
import { hour24Of } from '../../../store/clock-format';
import { noticeHandler, type NoticeHandler } from '../../../store/notice-registry';
import { nativeSleepPlayer } from './bedtime-data';
import { receiveSleepSound } from './sleep-sound-model';

export const BEDTIME_NOTICES: readonly NoticeHandler[] = [
  noticeHandler(['planner_bedtime'], (message, { live, store }) => {
    if (!live) return;
    const hour24 = hour24Of(store.get());
    notify({
      message: `Bedtime in ${String(message.minutesBefore)} min`,
      detail: `Bed at ${clockIn(hour24, message.bedAt)}`,
    });
  }),
  noticeHandler(['planner_wind_down'], (message, { live, store }) => {
    if (!live) return;
    const hour24 = hour24Of(store.get());
    notify({
      message: 'Wind-down has started',
      detail: `Bed at ${clockIn(hour24, message.bedAt)}, up at ${clockIn(hour24, message.wakeAt)}`,
    });
  }),
  noticeHandler(['planner_sleep_sound'], (message, { live }) => {
    if (!live) return;
    background(receiveSleepSound(message, nativeSleepPlayer), 'planner.sleep_sound_failed', {
      action: message.action,
    });
  }),
];
