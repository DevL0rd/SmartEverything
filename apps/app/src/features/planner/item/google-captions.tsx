import type {
  GoogleChoice,
  GoogleSyncLogEntry,
  PlannerCollectionRow,
  PlannerItemRow,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { readGoogleSyncLog } from '../../../api/google';
import type { AppHref } from '../../../components/app-href';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import type { Tone } from '../../../components/tone';
import { href } from '../../../app-shell/hrefs';
import { PLANNER_PREFIX } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { apiPerson, type PlannerPerson } from '../data';

export const GOOGLE_REMINDER_OVERRIDES = 5;

export type GoogleTitleKind = 'sending' | 'choose' | 'conflict';

export interface GoogleTitleCaption {
  readonly kind: GoogleTitleKind;
  readonly text: string;
  readonly action: string | null;
}

export function pendingChoiceOf(
  entries: readonly GoogleSyncLogEntry[],
  itemId: string,
): GoogleChoice | null {
  const entry = entries.find(
    ({ choice }) => choice !== null && choice.item_id === itemId && choice.resolved_at === null,
  );
  return entry?.choice ?? null;
}

export function titleCaptionOf(
  item: PlannerItemRow,
  choice: GoogleChoice | null,
): GoogleTitleCaption | null {
  const state = item.google?.state ?? null;
  if (state === 'conflict') {
    return { kind: 'conflict', text: 'Changed here and in Google', action: 'See the sync log' };
  }
  if (state !== 'sending') return null;
  if (choice === null) return { kind: 'sending', text: 'Sending to Google', action: null };
  return {
    kind: 'choose',
    text: `Google has ${String(choice.candidates.length)} tasks like this`,
    action: 'Choose',
  };
}

function hasTime(item: PlannerItemRow): boolean {
  return item.due_at !== null || (item.start_local?.includes('T') ?? false);
}

export function whenCaptionOf(
  item: PlannerItemRow,
  collection: PlannerCollectionRow | null,
): string | null {
  const googleTask = item.kind === 'task' && item.google !== null && collection?.kind === 'list';
  return googleTask && hasTime(item) ? 'time kept here' : null;
}

export function reminderCaptionOf(item: PlannerItemRow): string | null {
  if (item.google === null || item.kind !== 'event') return null;
  const kept = item.reminders.length - GOOGLE_REMINDER_OVERRIDES;
  if (kept <= 0) return null;
  return `${String(kept)} ${kept === 1 ? 'reminder' : 'reminders'} kept here`;
}

export function googleChoiceQuery(
  person: PlannerPerson,
  item: PlannerItemRow,
): {
  readonly queryKey: readonly unknown[];
  readonly queryFn: () => Promise<GoogleChoice | null>;
  readonly enabled: boolean;
} {
  return {
    queryKey: [...PLANNER_PREFIX, 'google-choice', person, item.id, item.updated_at],
    queryFn: async () =>
      pendingChoiceOf(await readGoogleSyncLog(apiPerson(person), undefined), item.id),
    enabled: item.google?.state === 'sending',
  };
}

export function useGoogleChoice(person: PlannerPerson, item: PlannerItemRow): GoogleChoice | null {
  return useScreenQuery(googleChoiceQuery(person, item)).data ?? null;
}

const CAPTION_LOOK: Readonly<Record<GoogleTitleKind, { icon: IconName; tone: Tone }>> = {
  sending: { icon: 'refresh', tone: 'variant' },
  choose: { icon: 'refresh', tone: 'variant' },
  conflict: { icon: 'warning', tone: 'warning' },
};

export const GOOGLE_SYNC_LOG: AppHref = href.settings.account('google');

function CaptionAction({
  label,
  text,
}: {
  readonly label: string;
  readonly text: string;
}): ReactNode {
  return (
    <Interactive
      label={`${text}. ${label}`}
      href={GOOGLE_SYNC_LOG}
      className="-my-1 rounded-sm px-1 py-1"
      layerClassName="rounded-sm"
    >
      <Text variant="footnote" tone="primary">
        {label}
      </Text>
    </Interactive>
  );
}

export function GoogleTitleLine({
  caption,
}: {
  readonly caption: GoogleTitleCaption | null;
}): ReactNode {
  if (caption === null) return null;
  const look = CAPTION_LOOK[caption.kind];
  return (
    <View className="flex-row flex-wrap items-center gap-x-1.5 gap-y-1">
      <Icon name={look.icon} size={16} tone={look.tone} />
      <Text variant="footnote" tone={look.tone} accessibilityLiveRegion="polite">
        {caption.action === null ? caption.text : `${caption.text} ·`}
      </Text>
      {caption.action === null ? null : (
        <CaptionAction label={caption.action} text={caption.text} />
      )}
    </View>
  );
}
