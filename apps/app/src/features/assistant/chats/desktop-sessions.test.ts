import { describe, expect, it } from 'vitest';
import type { ClaudeSession } from '@smarteverything/domain';
import type { DesktopHistoryComputer } from '../../computers';
import { sectionsOf, type ChatEntry } from './chat-entry';
import { partitionChats } from './chat-groups';
import {
  desktopEntriesOf,
  desktopEntryId,
  folderNameOf,
  historyFailedOf,
  historyOffOf,
} from './desktop-sessions';
import { APP_SOURCE } from '../model/chat-source';

function session(id: string, change: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id,
    desktop_id: null,
    title: id,
    cwd: '/home/me/project',
    state: 'idle',
    last_state: null,
    archived: false,
    model: null,
    permission_mode: 'unknown',
    entrypoint: null,
    pid: null,
    started_at: '2026-10-10T09:00:00.000Z',
    updated_at: '2026-10-17T09:00:00.000Z',
    waiting_prompts: 0,
    context_used: null,
    capabilities: {
      send: null,
      interrupt: null,
      answer_prompts: null,
      set_mode: null,
      set_model: null,
      usage: null,
    },
    ...change,
  };
}

function ready(deviceId: string, sessions: readonly ClaudeSession[]): DesktopHistoryComputer {
  return { deviceId, name: `pc-${deviceId}`, history: 'ready', sessions };
}

function appChat(id: string, at: string): ChatEntry {
  return {
    id,
    kind: 'chat',
    title: id,
    source: APP_SOURCE,
    at,
    pinned: false,
    archived: false,
    unread: 0,
    requests: 0,
    parentId: null,
    runtime: 'claude',
    computerId: null,
    line: { kind: 'empty' },
  };
}

describe('desktopEntriesOf', () => {
  it('lists each Desktop session as a read-only Claude entry with folder, time and computer', () => {
    const [entry] = desktopEntriesOf(
      [ready('d1', [session('s1', { title: 'Fix build' })])],
      new Set(),
    );
    expect(entry).toMatchObject({
      id: desktopEntryId('d1', 's1'),
      title: 'Fix build',
      runtime: 'claude',
      at: '2026-10-17T09:00:00.000Z',
      line: { kind: 'preview', text: 'project' },
      desktop: { deviceId: 'd1', deviceName: 'pc-d1' },
    });
  });

  it('leaves out a session already continued in the app so only the app chat shows', () => {
    const entries = desktopEntriesOf(
      [ready('d1', [session('s1'), session('s2')])],
      new Set(['s1']),
    );
    expect(entries.map((entry) => entry.desktop?.session.id)).toEqual(['s2']);
  });

  it('keeps sessions with the same id on two computers apart', () => {
    const entries = desktopEntriesOf(
      [ready('d1', [session('s')]), ready('d2', [session('s')])],
      new Set(),
    );
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2);
  });

  it('names untitled sessions and sessions without a folder or time', () => {
    const [entry] = desktopEntriesOf(
      [ready('d1', [session('s', { title: null, cwd: null, updated_at: null, started_at: null })])],
      new Set(),
    );
    expect(entry?.title).toBe('Untitled session');
    expect(entry?.line).toEqual({ kind: 'preview', speaker: null, text: 'Folder unavailable' });
    expect(entry?.at).toBe('1970-01-01T00:00:00.000Z');
  });

  it('skips archived sessions and computers that are not ready', () => {
    const entries = desktopEntriesOf(
      [
        ready('d1', [session('a', { archived: true })]),
        { deviceId: 'd2', name: 'x', history: 'off' },
        { deviceId: 'd3', name: 'y', history: 'loading' },
        { deviceId: 'd4', name: 'z', history: 'offline' },
      ],
      new Set(),
    );
    expect(entries).toEqual([]);
  });
});

describe('Desktop sessions in the Claude group', () => {
  it('sort with app Claude chats by recent activity', () => {
    const desktop = desktopEntriesOf(
      [ready('d1', [session('old', { updated_at: '2026-10-01T00:00:00.000Z' }), session('new')])],
      new Set(),
    );
    const pool = [appChat('app-mid', '2026-10-10T00:00:00.000Z'), ...desktop];
    const claude = partitionChats(pool, pool, new Set()).find((group) => group.key === 'claude');
    const sections = sectionsOf(claude?.entries ?? [], pool, {
      now: Date.parse('2026-10-18T00:00:00.000Z'),
      timeZone: null,
    });
    expect(sections.flatMap((section) => section.data.map((family) => family.entry.title))).toEqual(
      ['new', 'app-mid', 'old'],
    );
  });
});

describe('historyOffOf', () => {
  it('names each computer whose Earlier Claude history is off', () => {
    expect(
      historyOffOf([
        ready('d1', []),
        { deviceId: 'd2', name: 'Office', history: 'off' },
        { deviceId: 'd3', name: 'Away', history: 'offline' },
      ]),
    ).toEqual([{ deviceId: 'd2', name: 'Office' }]);
  });

  it('is empty when every computer reads its history', () => {
    expect(historyOffOf([ready('d1', [])])).toEqual([]);
  });
});

describe('historyFailedOf', () => {
  it('names each computer whose Desktop chats failed to load, with the reason', () => {
    expect(
      historyFailedOf([
        ready('d1', []),
        { deviceId: 'd2', name: 'Office', history: 'failed', reason: 'timed out' },
        { deviceId: 'd3', name: 'Away', history: 'offline' },
      ]),
    ).toEqual([{ deviceId: 'd2', name: 'Office', reason: 'timed out' }]);
  });
});

describe('folderNameOf', () => {
  it('shows the last folder of a posix or windows path', () => {
    expect(folderNameOf('/a/b/c/')).toBe('c');
    expect(folderNameOf('C:\\Users\\me\\code')).toBe('code');
  });
});
