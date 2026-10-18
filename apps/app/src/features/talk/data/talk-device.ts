import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { notify } from '../../../components/toast-store';
import { appPlatform } from '../../../design/platform';
import { setLocalPref } from '../../../store/local-prefs';

import { talkLog } from './talk-log';
async function androidReady(): Promise<boolean> {
  const microphone = await requestRecordingPermissionsAsync();
  talkLog.info('talk.microphone_permission', { granted: microphone.granted });
  if (!microphone.granted) {
    notify({
      message: 'Microphone not allowed',
      detail: 'Allow it in Android settings to talk.',
      tone: 'critical',
    });
    return false;
  }
  const notifications = await Notifications.requestPermissionsAsync();
  talkLog.info('talk.notification_permission', { granted: notifications.granted });
  if (!notifications.granted) {
    notify({
      message: 'Notifications are off',
      detail: 'The walkie-talkie still works, but you won’t see who is talking.',
    });
  }
  return true;
}

export async function turnTalkOn(): Promise<void> {
  if (appPlatform() === 'android' && !(await androidReady())) {
    talkLog.warn('talk.enable_blocked', { reason: 'permission' });
    return;
  }
  talkLog.info('talk.enabled');
  setLocalPref('talkEnabled', true);
}

export function turnTalkOff(): void {
  talkLog.info('talk.disabled');
  setLocalPref('talkEnabled', false);
}
