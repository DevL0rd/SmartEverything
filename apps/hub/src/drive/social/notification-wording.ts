import type { DriveNotificationKind } from '@smarteverything/domain';

export interface NotificationNames {
  readonly actor: string;
  readonly item: string;
}

export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

interface Wording {
  readonly title: string;
  readonly body: (names: NotificationNames) => string;
}

export const NOTIFICATION_WORDING: Readonly<Record<DriveNotificationKind, Wording>> = {
  shared: {
    title: 'Shared with you',
    body: ({ actor, item }) => `${actor} shared ${item} with you`,
  },
  edited: { title: 'File edited', body: ({ actor, item }) => `${actor} edited ${item}` },
  commented: {
    title: 'New comment',
    body: ({ actor, item }) => `${actor} commented on ${item}`,
  },
  mentioned: {
    title: 'You were mentioned',
    body: ({ actor, item }) => `${actor} mentioned you in a comment on ${item}`,
  },
  replied: {
    title: 'New reply',
    body: ({ actor, item }) => `${actor} replied to a comment on ${item}`,
  },
  access_requested: {
    title: 'Access requested',
    body: ({ actor, item }) => `${actor} asked for access to ${item}`,
  },
  access_answered: {
    title: 'Access request answered',
    body: ({ actor, item }) => `${actor} answered your request for ${item}`,
  },
  file_request_upload: {
    title: 'Files received',
    body: ({ actor, item }) => `${actor} sent files to ${item}`,
  },
  transfer_offered: {
    title: 'Ownership offered',
    body: ({ actor, item }) => `${actor} wants you to own ${item}`,
  },
  transfer_answered: {
    title: 'Ownership offer answered',
    body: ({ actor, item }) => `${actor} answered your offer of ${item}`,
  },
};

export type NotificationTarget = 'item' | 'access_request' | 'transfer';

export const NOTIFICATION_TARGET: Readonly<Record<DriveNotificationKind, NotificationTarget>> = {
  shared: 'item',
  edited: 'item',
  commented: 'item',
  mentioned: 'item',
  replied: 'item',
  access_requested: 'access_request',
  access_answered: 'item',
  file_request_upload: 'item',
  transfer_offered: 'transfer',
  transfer_answered: 'transfer',
};

export function notificationText(
  kind: DriveNotificationKind,
  names: NotificationNames,
): NotificationText {
  const wording = NOTIFICATION_WORDING[kind];
  return { title: wording.title, body: wording.body(names) };
}
