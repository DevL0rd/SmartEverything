import { compareText } from '../../../format/text';
import {
  AUTOMATION_SECRET_INPUT,
  type AutomationSecretEntry,
  type AutomationSecretInput,
  type AutomationSecretUser,
} from '@smarteverything/domain';

export type UsersBySecret = ReadonlyMap<string, readonly AutomationSecretUser[]>;

export interface SecretRowModel {
  readonly id: string;
  readonly name: string;
  readonly added: string;
  readonly updated: string | null;
  readonly users: readonly AutomationSecretUser[];
  readonly usesLabel: string;
}

export type RemoveVerdict =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly title: string;
      readonly body: string;
      readonly users: readonly AutomationSecretUser[];
    };

export interface SecretDraft {
  readonly name: string;
  readonly value: string;
}

export interface DraftIssues {
  readonly name: string | null;
  readonly value: string | null;
}

export interface SheetCopy {
  readonly title: string;
  readonly valueLabel: string;
  readonly helper: string;
  readonly submit: string;
  readonly replaces: boolean;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const EMPTY_DRAFT: SecretDraft = { name: '', value: '' };

export function dayText(iso: string, now: Date): string {
  const moment = new Date(iso);
  const month = MONTHS[moment.getMonth()] ?? '';
  const base = `${String(moment.getDate())} ${month}`;
  return moment.getFullYear() === now.getFullYear()
    ? base
    : `${base} ${String(moment.getFullYear())}`;
}

export function usesLabel(count: number): string {
  if (count === 0) return 'Not used yet';
  return count === 1 ? 'Used by 1 automation' : `Used by ${String(count)} automations`;
}

export function secretRows(
  entries: readonly AutomationSecretEntry[],
  users: UsersBySecret,
  now: Date,
): readonly SecretRowModel[] {
  return [...entries]
    .sort((a, b) => compareText(a.name, b.name))
    .map((entry) => {
      const using = users.get(entry.id) ?? [];
      return {
        id: entry.id,
        name: entry.name,
        added: dayText(entry.createdAt, now),
        updated: entry.updatedAt === entry.createdAt ? null : dayText(entry.updatedAt, now),
        users: using,
        usesLabel: usesLabel(using.length),
      };
    });
}

export function dateLine(row: SecretRowModel): string {
  return row.updated === null
    ? `Added ${row.added}`
    : `Added ${row.added} · Value replaced ${row.updated}`;
}

export function removeVerdict(row: SecretRowModel): RemoveVerdict {
  if (row.users.length === 0) return { allowed: true };
  return {
    allowed: false,
    title: `${row.name} is still in use`,
    body: 'Change the Web request nodes below to another secret, then remove it.',
    users: row.users,
  };
}

export function usersBySecret(
  pairs: readonly (readonly [string, AutomationSecretUser])[],
): UsersBySecret {
  const grouped = new Map<string, AutomationSecretUser[]>();
  for (const [secretId, user] of pairs) {
    const list = grouped.get(secretId) ?? [];
    list.push(user);
    grouped.set(secretId, list);
  }
  return grouped;
}

export function sheetCopy(
  draft: SecretDraft,
  entries: readonly AutomationSecretEntry[],
  replacing: SecretRowModel | null,
): SheetCopy {
  const named = replacing?.name ?? draft.name.trim();
  const replaces = replacing !== null || entries.some((entry) => entry.name === named);
  return {
    title: replacing === null ? 'Add a secret' : `Replace ${replacing.name}`,
    valueLabel: replaces ? 'New value' : 'Value',
    helper: replaces
      ? 'The old value is overwritten. Automations keep using this secret.'
      : 'Stored on your hub. It is never shown again after you save.',
    submit: replaces ? 'Replace value' : 'Save secret',
    replaces,
  };
}

export function draftIssues(draft: SecretDraft, touched: boolean): DraftIssues {
  if (!touched) return { name: null, value: null };
  const parsed = AUTOMATION_SECRET_INPUT.safeParse({ name: draft.name, value: draft.value });
  if (parsed.success) return { name: null, value: null };
  const messageAt = (key: string): string | null =>
    parsed.error.issues.find((issue) => issue.path[0] === key)?.message ?? null;
  return { name: messageAt('name'), value: messageAt('value') };
}

export function draftBody(draft: SecretDraft): AutomationSecretInput | null {
  const parsed = AUTOMATION_SECRET_INPUT.safeParse({ name: draft.name, value: draft.value });
  return parsed.success ? parsed.data : null;
}

export function replaceDraft(row: SecretRowModel): SecretDraft {
  return { name: row.name, value: '' };
}
