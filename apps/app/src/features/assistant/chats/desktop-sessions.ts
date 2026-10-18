import type { DesktopHistoryComputer } from '../../computers';
import { APP_SOURCE } from '../model/chat-source';
import type { ClaudeSession } from '@smarteverything/domain';
import type { ChatEntry, ChatLine } from './chat-entry';

export interface HistoryOff {
  readonly deviceId: string;
  readonly name: string;
}

export interface HistoryFailure {
  readonly deviceId: string;
  readonly name: string;
  readonly reason: string;
}

const UNTITLED = 'Untitled session';
const NO_FOLDER = 'Folder unavailable';
const NEVER = '1970-01-01T00:00:00.000Z';

export function desktopEntryId(deviceId: string, sessionId: string): string {
  return `desktop:${deviceId}:${sessionId}`;
}

export function folderNameOf(cwd: string | null): string {
  if (cwd === null) return NO_FOLDER;
  const parts = cwd.split(/[\\/]/).filter((part) => part !== '');
  return parts.at(-1) ?? cwd;
}

function lineOf(session: ClaudeSession): ChatLine {
  return session.state === 'busy'
    ? { kind: 'working', step: folderNameOf(session.cwd) }
    : { kind: 'preview', speaker: null, text: folderNameOf(session.cwd) };
}

export function desktopEntriesOf(
  computers: readonly DesktopHistoryComputer[],
  continued: ReadonlySet<string>,
): readonly ChatEntry[] {
  return computers.flatMap((computer) =>
    computer.history !== 'ready'
      ? []
      : computer.sessions
          .filter((session) => !session.archived && !continued.has(session.id))
          .map((session): ChatEntry => ({
            id: desktopEntryId(computer.deviceId, session.id),
            kind: 'chat',
            title: session.title ?? UNTITLED,
            source: APP_SOURCE,
            at: session.updated_at ?? session.started_at ?? NEVER,
            pinned: false,
            archived: false,
            unread: 0,
            requests: session.waiting_prompts,
            parentId: null,
            runtime: 'claude',
            computerId: computer.deviceId,
            line: lineOf(session),
            desktop: { deviceId: computer.deviceId, deviceName: computer.name, session },
          })),
  );
}

export function historyOffOf(computers: readonly DesktopHistoryComputer[]): readonly HistoryOff[] {
  return computers
    .filter((computer) => computer.history === 'off')
    .map((computer) => ({ deviceId: computer.deviceId, name: computer.name }));
}

export function historyFailedOf(
  computers: readonly DesktopHistoryComputer[],
): readonly HistoryFailure[] {
  return computers.flatMap((computer) =>
    computer.history === 'failed'
      ? [{ deviceId: computer.deviceId, name: computer.name, reason: computer.reason }]
      : [],
  );
}
