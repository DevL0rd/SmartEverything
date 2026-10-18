import type { PhoneAction } from '@smarteverything/domain';

export function launchAppAction(app: string): PhoneAction {
  return { type: 'launch_app', app };
}

export function dismissKeyAction(key: string): PhoneAction {
  return { type: 'dismiss_notification', target: { by: 'key', key } };
}

export function dismissAppAction(app: string): PhoneAction {
  return { type: 'dismiss_notification', target: { by: 'app', app } };
}
