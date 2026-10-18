import { z } from 'zod';

export const LIVE_NOTIFICATION_NOTICE = z.strictObject({
  type: z.literal('notification'),
  id: z.string().min(1).describe('Names the notification so a second delivery replaces the first'),
  requestId: z.uuid().describe('The phone answers with this once the notification is on screen'),
  title: z.string(),
  body: z.string(),
  data: z.record(z.string(), z.string()).describe('What a tap needs to open the right page'),
});

export type LiveNotificationNotice = z.infer<typeof LIVE_NOTIFICATION_NOTICE>;

export function liveNotificationId(subject: Readonly<Record<string, string>>): string {
  return Object.entries(subject)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}
