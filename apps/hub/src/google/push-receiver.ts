import { Logger, background } from '@smarteverything/logging';
import type { GoogleSyncStateRepository } from '../store/repositories/google-sync-state';
import { validChannelToken } from './channels';
import type { GoogleSyncRunner } from './sync-runner';

const log = new Logger('hub.google');

export type PushOutcome = 'queued' | 'ignored' | 'rejected';

export interface PushNotification {
  readonly channelId: string;
  readonly token: string | null;
  readonly resourceId: string | null;
  readonly state: string | null;
}

export interface GooglePushReceiverOptions {
  readonly states: Pick<GoogleSyncStateRepository, 'byChannel'>;
  readonly runner: Pick<GoogleSyncRunner, 'sync'>;
  readonly key: Uint8Array;
}

export class GooglePushReceiver {
  constructor(private readonly options: GooglePushReceiverOptions) {}

  receive(notification: PushNotification): PushOutcome {
    const { channelId } = notification;
    if (!validChannelToken(this.options.key, channelId, notification.token)) {
      log.warn('google.push_rejected', { channelId });
      return 'rejected';
    }
    const stored = this.options.states.byChannel(channelId);
    if (stored === undefined) return 'ignored';
    if (stored.channel?.resource_id !== notification.resourceId) {
      log.warn('google.push_rejected', { channelId });
      return 'rejected';
    }
    if (notification.state !== 'exists') return 'ignored';
    background(this.options.runner.sync(stored.profile_id, 'push'), 'google.push_sync_failed', {
      profileId: stored.profile_id,
    });
    return 'queued';
  }
}
