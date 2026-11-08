import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DELIVERABLES_PRESENTED_EVENT,
  DSH_SESSION_HEADER,
  JSON_VALUE,
  WORKSPACE_CHANGES_RECORD,
  WORKSPACE_STATE_RECORD,
} from '@smarteverything/domain';
import type {
  AiHarnessTarget,
  DshSessionEvent,
  DshSessionMetadata,
  WorkspaceChangesRecordData,
} from '@smarteverything/domain';
import {
  DeliverableProjector,
  NO_WORKSPACE,
  readWorkspace,
  type ChatSessionSource,
  type DeliveryPorts,
  type StoredOutFile,
} from '../../../src/harness/workspace-routes';

const PROFILE = randomUUID();
const CHAT = randomUUID();
const SESSION = 'session-1';
const OWNER = { profileId: PROFILE, role: 'owner' } as const;

function record(turn: number, names: readonly string[]): WorkspaceChangesRecordData {
  return {
    seq: turn,
    turn,
    cwd: '/work',
    files: names.map((name) => ({
      path: name,
      display: name,
      added: 2,
      deleted: 1,
      diff: {
        kind: 'text',
        path: name,
        display: name,
        before: true,
        after: true,
        hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: ['-a', '+b', '+c'] }],
        coarse: false,
      },
    })),
    total: names.length,
    added: 2 * names.length,
    deleted: names.length,
  };
}

const authorized = (): void => undefined;

function event(seq: number, type: string, data: unknown): DshSessionEvent {
  return { type, seq, time: seq, data: JSON_VALUE.parse(data) };
}

function source(
  events: readonly DshSessionEvent[],
  target: AiHarnessTarget = { kind: 'server' },
  sessionId: string | null = SESSION,
): ChatSessionSource {
  const metadata: DshSessionMetadata = {
    chat_id: CHAT,
    profile_id: PROFILE,
    header: DSH_SESSION_HEADER.parse({ version: 4, id: SESSION, createdAt: 0, isSeeded: false }),
    inherited_event_count: 0,
    next_seq: events.length,
    durable_seq: events.length - 1,
  };
  return {
    own: () => ({ id: CHAT, profile_id: PROFILE }),
    binding: () => ({ session_id: sessionId, execution_target: target }),
    store: { dshSessions: { stat: () => metadata, readAll: () => events } },
  };
}

function ports(
  stored: string[],
  fail = false,
): DeliveryPorts & { readonly calls: { path: string; local: boolean }[] } {
  const calls: { path: string; local: boolean }[] = [];
  return {
    calls,
    authorize: (): (() => void) => authorized,
    fromOutFile: (_profile, file, scope): Promise<StoredOutFile> => {
      calls.push({ path: file.path, local: scope.local });
      if (fail) return Promise.reject(new Error('outside the chat folder'));
      const id = randomUUID();
      stored.push(id);
      return Promise.resolve({ id });
    },
  };
}

describe('the workspace read model', () => {
  it('is empty for a chat that has no session yet', async () => {
    const projector = new DeliverableProjector(ports([]));

    const workspace = await readWorkspace(source([], undefined, null), projector, OWNER, CHAT);

    expect(workspace).toStrictEqual(NO_WORKSPACE);
  });

  it('lists the turns in order and lets the latest record of a turn win', async () => {
    const projector = new DeliverableProjector(ports([]));
    const events = [
      event(3, WORKSPACE_CHANGES_RECORD, record(2, ['b.ts'])),
      event(5, WORKSPACE_CHANGES_RECORD, record(1, ['a.ts'])),
      event(9, WORKSPACE_CHANGES_RECORD, record(1, ['a.ts', 'c.ts'])),
    ];

    const workspace = await readWorkspace(source(events), projector, OWNER, CHAT);

    expect(
      workspace.turns.map((turn) => [turn.turn, turn.files.map((file) => file.display)]),
    ).toStrictEqual([
      [1, ['a.ts', 'c.ts']],
      [2, ['b.ts']],
    ]);
    expect(workspace.turns[0]?.files[0]).toMatchObject({
      added: 2,
      deleted: 1,
      binary: false,
      oversized: false,
      diff: {
        kind: 'text',
        hunks: [{ old_start: 1, old_lines: 1, new_start: 1, new_lines: 2 }],
      },
    });
  });

  it('keeps binary and oversized files without lines', async () => {
    const projector = new DeliverableProjector(ports([]));
    const base = record(1, []);
    const changed: WorkspaceChangesRecordData = {
      ...base,
      files: [
        {
          path: 'pic.png',
          display: 'pic.png',
          added: 0,
          deleted: 0,
          binary: true,
          diff: { kind: 'binary', path: 'pic.png', display: 'pic.png' },
        },
        {
          path: 'big.bin',
          display: 'big.bin',
          added: 0,
          deleted: 0,
          oversized: true,
          diff: { kind: 'oversized', path: 'big.bin', display: 'big.bin' },
        },
      ],
      total: 2,
    };

    const workspace = await readWorkspace(
      source([event(2, WORKSPACE_CHANGES_RECORD, changed)]),
      projector,
      OWNER,
      CHAT,
    );

    expect(workspace.turns[0]?.files.map((entry) => entry.diff)).toStrictEqual([
      { kind: 'binary' },
      { kind: 'oversized' },
    ]);
    expect(workspace.turns[0]?.files.map((entry) => [entry.binary, entry.oversized])).toStrictEqual(
      [
        [true, false],
        [false, true],
      ],
    );
  });

  it('reports whether git could track the shell edits, the newest word standing', async () => {
    const projector = new DeliverableProjector(ports([]));

    const unknown = await readWorkspace(source([]), projector, OWNER, CHAT);
    const missing = await readWorkspace(
      source([event(1, WORKSPACE_STATE_RECORD, { git: 'missing' })]),
      projector,
      OWNER,
      CHAT,
    );
    const later = await readWorkspace(
      source([
        event(1, WORKSPACE_STATE_RECORD, { git: 'missing' }),
        event(7, WORKSPACE_STATE_RECORD, { git: 'present' }),
      ]),
      projector,
      OWNER,
      CHAT,
    );

    expect([unknown.git, missing.git, later.git]).toStrictEqual(['unknown', 'missing', 'present']);
  });

  it('skips a record that does not match the contract instead of failing the read', async () => {
    const projector = new DeliverableProjector(ports([]));
    const events = [
      event(1, WORKSPACE_CHANGES_RECORD, { turn: 'one' }),
      event(2, WORKSPACE_CHANGES_RECORD, record(2, ['ok.ts'])),
    ];

    const workspace = await readWorkspace(source(events), projector, OWNER, CHAT);

    expect(workspace.turns.map((turn) => turn.turn)).toStrictEqual([2]);
  });
});

describe('the deliverable projector', () => {
  const presented = event(4, DELIVERABLES_PRESENTED_EVENT, {
    turn: 1,
    callId: 'p1',
    files: [
      { path: '/chat/workspace/a.docx', description: 'The draft' },
      { path: '/chat/workspace/b.xlsx' },
    ],
  });

  it('stores each declared file once and links it to the declaration', async () => {
    const stored: string[] = [];
    const delivery = ports(stored);
    const projector = new DeliverableProjector(delivery);
    const chat = source([presented]);

    const first = await readWorkspace(chat, projector, OWNER, CHAT);
    const second = await readWorkspace(chat, projector, OWNER, CHAT);

    expect(delivery.calls).toStrictEqual([
      { path: '/chat/workspace/a.docx', local: true },
      { path: '/chat/workspace/b.xlsx', local: true },
    ]);
    expect(first.deliverables).toStrictEqual([
      {
        turn: 1,
        call_id: 'p1',
        path: '/chat/workspace/a.docx',
        description: 'The draft',
        attachment_id: stored[0],
      },
      {
        turn: 1,
        call_id: 'p1',
        path: '/chat/workspace/b.xlsx',
        description: null,
        attachment_id: stored[1],
      },
    ]);
    expect(second).toStrictEqual(first);
  });

  it('leaves the files of a chat on another machine unstored until a node upload exists', async () => {
    const delivery = ports([]);
    const projector = new DeliverableProjector(delivery);

    const workspace = await readWorkspace(
      source([presented], { kind: 'device', device_id: randomUUID() }),
      projector,
      OWNER,
      CHAT,
    );

    expect(delivery.calls).toStrictEqual([]);
    expect(workspace.deliverables.map((entry) => entry.attachment_id)).toStrictEqual([null, null]);
  });

  it('keeps the declaration when the file cannot be stored and tries again on the next read', async () => {
    const delivery = ports([], true);
    const projector = new DeliverableProjector(delivery);
    const chat = source([presented]);

    const workspace = await readWorkspace(chat, projector, OWNER, CHAT);
    await readWorkspace(chat, projector, OWNER, CHAT);

    expect(workspace.deliverables.map((entry) => entry.attachment_id)).toStrictEqual([null, null]);
    expect(delivery.calls).toHaveLength(4);
  });

  it('does not store anything when a declaration breaks the contract', async () => {
    const delivery = ports([]);
    const projector = new DeliverableProjector(delivery);
    const spy = vi.fn();
    delivery.calls.push = spy;

    const workspace = await readWorkspace(
      source([event(2, DELIVERABLES_PRESENTED_EVENT, { files: 'none' })]),
      projector,
      OWNER,
      CHAT,
    );

    expect(workspace.deliverables).toStrictEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
