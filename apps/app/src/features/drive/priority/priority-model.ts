import type {
  DriveAccessRequest,
  DriveNotification,
  DriveSuggestion,
  DriveTransfer,
} from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { count } from '../../../format/number';
import { daysBetween, localDayKey, relative } from '../../../format/time';

export type SuggestionBand = 'today' | 'week' | 'earlier';

export const BAND_LABEL: Readonly<Record<SuggestionBand, string>> = {
  today: 'Today',
  week: 'This week',
  earlier: 'Earlier',
};

const BANDS: readonly SuggestionBand[] = ['today', 'week', 'earlier'];

const WEEK_DAYS = 7;

export interface SuggestionGroup {
  readonly band: SuggestionBand;
  readonly label: string;
  readonly suggestions: readonly DriveSuggestion[];
}

export function bandOf(at: string, now: number, timeZone: string | null): SuggestionBand {
  const days = daysBetween(localDayKey(at, timeZone), localDayKey(now, timeZone));
  if (days <= 0) return 'today';
  return days < WEEK_DAYS ? 'week' : 'earlier';
}

export function suggestionGroupsOf(
  suggestions: readonly DriveSuggestion[],
  now: number,
  timeZone: string | null,
): readonly SuggestionGroup[] {
  const seen = new Set<string>();
  const sorted = [...suggestions]
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .filter((suggestion) => {
      if (seen.has(suggestion.item.id)) return false;
      seen.add(suggestion.item.id);
      return true;
    });
  return BANDS.flatMap((band) => {
    const inBand = sorted.filter((suggestion) => bandOf(suggestion.at, now, timeZone) === band);
    return inBand.length === 0 ? [] : [{ band, label: BAND_LABEL[band], suggestions: inBand }];
  });
}

export type NameOf = (profileId: string) => string | null;

function personOf(suggestion: DriveSuggestion, nameOf: NameOf): string {
  if (!('actorProfileId' in suggestion)) return 'You';
  return nameOf(suggestion.actorProfileId) ?? 'Someone';
}

export function reasonOf(suggestion: DriveSuggestion, nameOf: NameOf): string {
  const who = personOf(suggestion, nameOf);
  switch (suggestion.reason) {
    case 'opened':
      return 'You opened it';
    case 'edited':
      return 'You edited it';
    case 'edited_by':
      return `${who} edited it`;
    case 'shared':
      return `${who} shared it with you`;
    case 'commented':
      return `${who} commented`;
    case 'mentioned':
      return `${who} mentioned you`;
  }
}

export function reasonLineOf(suggestion: DriveSuggestion, nameOf: NameOf, now: number): string {
  return `${reasonOf(suggestion, nameOf)} · ${relative(suggestion.at, now)}`;
}

export const REASON_ICON: Readonly<Record<DriveSuggestion['reason'], IconName>> = {
  opened: 'eye',
  edited: 'pencil',
  edited_by: 'pencil',
  shared: 'share',
  commented: 'messageCircle',
  mentioned: 'atSign',
};

export function suggestionsInDrive(
  suggestions: readonly DriveSuggestion[],
  rootId: string | null,
): readonly DriveSuggestion[] {
  if (rootId === null) return suggestions;
  return suggestions.filter((suggestion) => suggestion.item.rootId === rootId);
}

export type WaitingKind = 'access' | 'transfer' | 'mention';

export interface WaitingTile {
  readonly kind: WaitingKind;
  readonly count: number;
  readonly label: string;
  readonly icon: IconName;
}

export interface WaitingInputs {
  readonly viewerId: string | null;
  readonly requests: readonly DriveAccessRequest[];
  readonly transfers: readonly DriveTransfer[];
  readonly notifications: readonly DriveNotification[];
}

function tile(kind: WaitingKind, total: number, one: string, many: string): WaitingTile[] {
  if (total === 0) return [];
  const icon: IconName = kind === 'access' ? 'key' : kind === 'transfer' ? 'users' : 'atSign';
  return [{ kind, count: total, label: total === 1 ? one : many, icon }];
}

export function waitingTilesOf(inputs: WaitingInputs): readonly WaitingTile[] {
  const { viewerId } = inputs;
  if (viewerId === null) return [];
  const requests = inputs.requests.filter(
    (request) => request.state === 'pending' && request.ownerProfileId === viewerId,
  ).length;
  const transfers = inputs.transfers.filter(
    (transfer) => transfer.state === 'offered' && transfer.toProfileId === viewerId,
  ).length;
  const mentions = inputs.notifications.filter(
    (row) => row.kind === 'mentioned' && row.readAt === null && row.profileId === viewerId,
  ).length;
  return [
    ...tile('access', requests, 'Access request', 'Access requests'),
    ...tile('transfer', transfers, 'File offered to you', 'Files offered to you'),
    ...tile('mention', mentions, 'Unread mention', 'Unread mentions'),
  ];
}

export function prioritySubtitleOf(
  shown: number,
  more: boolean,
  waiting: readonly WaitingTile[],
): string {
  const waits = waiting.reduce((sum, entry) => sum + entry.count, 0);
  const files = more ? `${count(shown)}+ files` : shown === 1 ? '1 file' : `${count(shown)} files`;
  return waits === 0 ? files : `${files} · ${count(waits)} waiting for you`;
}

export const PRIORITY_EMPTY_TITLE = 'Nothing to suggest yet';

export const PRIORITY_EMPTY_BODY =
  'Files you open, edit or get shared show here, newest first, with the reason they are here.';
