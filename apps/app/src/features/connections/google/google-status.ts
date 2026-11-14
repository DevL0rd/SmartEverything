import type { GoogleAccountRow, GoogleProblem, ProfileRow } from '@smarteverything/domain';
import { compareText } from '../../../format/text';
import { shortClock } from '../../../format/time';
import type { StatusTone } from '../../../components/tone';

export interface GooglePerson {
  readonly id: string;
  readonly name: string;
  readonly colour: ProfileRow['colour'];
}

export interface GoogleProblemText {
  readonly title: string;
  readonly body: string;
}

export interface ServiceRow {
  readonly person: GooglePerson;
  readonly isMe: boolean;
  readonly who: string;
  readonly text: string;
  readonly critical: boolean;
  readonly dot: StatusTone | null;
}

const ITEMS_SAFE = 'Your planner items are safe.';

export function problemText(problem: GoogleProblem | null, subject: string): GoogleProblemText {
  switch (problem) {
    case 'invalid_grant':
      return {
        title: `Google signed ${subject} out`,
        body: `Access was removed or not used for six months. ${ITEMS_SAFE} Relink to start syncing again.`,
      };
    case 'scope_missing':
      return {
        title: 'Calendar and Tasks access was not granted',
        body: `Link again and allow Calendar and Tasks on the Google consent screen. ${ITEMS_SAFE}`,
      };
    case 'client_missing':
      return {
        title: 'The Google app is not set up',
        body: 'Enter the Android and Desktop client IDs under Your Google app, then link again.',
      };
    case 'network':
      return {
        title: 'Google could not be reached',
        body: 'The hub retries on the next change or when you sync now.',
      };
    case 'rate_limited':
      return {
        title: 'Google asked for a pause',
        body: 'The sync resumes by itself once Google allows it again.',
      };
    case 'cancelled':
      return { title: 'The Google sign-in was cancelled', body: 'Link again to finish it.' };
    case 'unknown':
    case null:
      return {
        title: 'Google needs attention',
        body: `Relink to start syncing again. ${ITEMS_SAFE}`,
      };
  }
}

export function syncedText(row: GoogleAccountRow): string | null {
  return row.last_sync_at === null ? null : `synced ${shortClock(row.last_sync_at)}`;
}

export function statusText(row: GoogleAccountRow | null, subject: string): string {
  switch (row?.status ?? 'unlinked') {
    case 'unlinked':
      return 'Not linked';
    case 'linking':
      return 'Signing in to Google';
    case 'needs_attention':
      return `Needs attention · ${problemText(row?.problem ?? null, subject).title}`;
    case 'linked':
      return linkedText(row);
  }
}

function linkedText(row: GoogleAccountRow | null): string {
  if (row === null) return 'Not linked';
  const linked = row.email === null ? 'Linked' : `Linked as ${row.email}`;
  const synced = syncedText(row);
  return synced === null ? linked : `${linked} · ${synced}`;
}

const DOT: Readonly<Record<GoogleAccountRow['status'], StatusTone | null>> = {
  unlinked: null,
  linking: 'info',
  needs_attention: 'critical',
  linked: 'positive',
};

export function statusDot(row: GoogleAccountRow | null): StatusTone | null {
  return DOT[row?.status ?? 'unlinked'];
}

export function serviceRows(
  people: readonly GooglePerson[],
  accounts: readonly GoogleAccountRow[],
  me: string | null,
  owner: boolean,
): ServiceRow[] {
  const byPerson = new Map(accounts.map((row) => [row.profile_id, row]));
  const shown = people.filter((person) => owner || person.id === me);
  const ordered = [
    ...shown.filter((person) => person.id === me),
    ...shown
      .filter((person) => person.id !== me)
      .sort((left, right) => compareText(left.name, right.name)),
  ];
  return ordered.map((person) => {
    const row = byPerson.get(person.id) ?? null;
    const isMe = person.id === me;
    return {
      person,
      isMe,
      who: isMe ? 'You' : person.name,
      text: statusText(row, isMe ? 'you' : person.name),
      critical: row?.status === 'needs_attention',
      dot: statusDot(row),
    };
  });
}
