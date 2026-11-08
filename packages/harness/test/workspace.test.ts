import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Context } from '@deepseek-ai/cordis';
import {
  AI_AGENT_LOOP_SETTINGS,
  DELIVERABLES_PRESENTED_DATA,
  DELIVERABLES_PRESENTED_EVENT,
  WORKSPACE_CHANGES_RECORD,
  WORKSPACE_CHANGES_RECORD_DATA,
  WORKSPACE_STATE_RECORD,
  WORKSPACE_STATE_RECORD_DATA,
} from '@smarteverything/domain';
import { bindAgentLoopSettings } from '../src/plugins/goals';
import { bootRuntime } from './support/runtime';
import type { RuntimeFixture } from './support/runtime';

const run = promisify(execFile);
const SETTLE_MS = 20_000;

let fixture: RuntimeFixture | undefined;
let anchor: Context | undefined;
let scratch: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await fixture?.dispose();
  fixture = undefined;
  anchor = undefined;
  if (scratch !== undefined) await rm(scratch, { recursive: true, force: true });
  scratch = undefined;
});

interface Recorded {
  readonly type: string;
  readonly data: unknown;
  readonly ignorable?: true;
}

function eventsOf(host: RuntimeFixture, sessionId: string): readonly Recorded[] {
  return host.persistence.sessions.get(sessionId)?.events ?? [];
}

async function converse(
  host: RuntimeFixture,
  sessionId: string,
  until: (events: readonly Recorded[]) => boolean,
): Promise<void> {
  const session = await host.runtime.create(host.sessionOptions(sessionId));
  session.text('change some files');
  await vi.waitFor(
    async () => {
      await session.flush();
      expect(eventsOf(host, sessionId).map((event) => event.type)).toContain('turn/end');
      expect(until(eventsOf(host, sessionId))).toBe(true);
    },
    { timeout: SETTLE_MS },
  );
}

function recordsOf(events: readonly Recorded[], type: string): readonly unknown[] {
  return events.filter((event) => event.type === type).map((event) => event.data);
}

describe('the changed files of a turn', () => {
  it('records what the file tools wrote with its comparison, without a git repository', async () => {
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    fixture.model.script(
      {
        kind: 'tool',
        id: 'w1',
        name: 'write',
        input: { file_path: join(fixture.workspace, 'notes.txt'), content: 'one\ntwo\n' },
      },
      { kind: 'text', text: 'written' },
    );

    await converse(fixture, sessionId, (events) =>
      events.some((event) => event.type === WORKSPACE_CHANGES_RECORD),
    );

    const [record] = recordsOf(eventsOf(fixture, sessionId), WORKSPACE_CHANGES_RECORD);
    const parsed = WORKSPACE_CHANGES_RECORD_DATA.parse(record);
    expect(parsed.turn).toBe(1);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0]).toMatchObject({ display: 'notes.txt', added: 2, deleted: 0 });
    expect(parsed.files[0]?.diff).toMatchObject({ kind: 'text', before: false, after: true });
    expect(
      eventsOf(fixture, sessionId).find((event) => event.type === WORKSPACE_CHANGES_RECORD),
    ).toMatchObject({ ignorable: true });
  });

  it('records a file the shell wrote when the directory is a git repository', async () => {
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    await run('git', ['init', '--quiet'], { cwd: fixture.workspace });
    fixture.model.script(
      {
        kind: 'tool',
        id: 'b1',
        name: 'bash',
        input: {
          description: 'Write a file from the shell',
          command: 'printf "from shell\\n" > shell.txt',
        },
      },
      { kind: 'text', text: 'done' },
    );

    await converse(fixture, sessionId, (events) =>
      events.some((event) => event.type === WORKSPACE_CHANGES_RECORD),
    );

    const [record] = recordsOf(eventsOf(fixture, sessionId), WORKSPACE_CHANGES_RECORD);
    const parsed = WORKSPACE_CHANGES_RECORD_DATA.parse(record);
    expect(parsed.snapshot).toBeDefined();
    expect(parsed.files.map((file) => file.display)).toStrictEqual(['shell.txt']);
    expect(parsed.files[0]?.diff).toMatchObject({ kind: 'text', after: true });
  });
});

describe('the git availability state', () => {
  it('says git is present when the machine has it', async () => {
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    fixture.model.script({ kind: 'text', text: 'hello' });

    await converse(fixture, sessionId, (events) =>
      events.some((event) => event.type === WORKSPACE_STATE_RECORD),
    );

    expect(
      recordsOf(eventsOf(fixture, sessionId), WORKSPACE_STATE_RECORD).map((data) =>
        WORKSPACE_STATE_RECORD_DATA.parse(data),
      ),
    ).toStrictEqual([{ git: 'present' }]);
  });

  it('says git is missing when no git executable is on the path', async () => {
    scratch = await mkdtemp(join(tmpdir(), 'no-git-'));
    vi.stubEnv('PATH', scratch);
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    fixture.model.script({ kind: 'text', text: 'hello' });

    await converse(fixture, sessionId, (events) =>
      events.some((event) => event.type === WORKSPACE_STATE_RECORD),
    );

    expect(
      recordsOf(eventsOf(fixture, sessionId), WORKSPACE_STATE_RECORD).map((data) =>
        WORKSPACE_STATE_RECORD_DATA.parse(data),
      ),
    ).toStrictEqual([{ git: 'missing' }]);
  });
});

describe('the presented deliverables', () => {
  it('declare absolute paths and copy nothing', async () => {
    fixture = await bootRuntime();
    const sessionId = randomUUID();
    await writeFile(join(fixture.workspace, 'report.txt'), 'final\n');
    fixture.model.script(
      {
        kind: 'tool',
        id: 'p1',
        name: 'present',
        input: { files: [{ path: 'report.txt', description: 'The report' }] },
      },
      { kind: 'text', text: 'presented' },
    );

    await converse(fixture, sessionId, (events) =>
      events.some((event) => event.type === DELIVERABLES_PRESENTED_EVENT),
    );

    const [declared] = recordsOf(eventsOf(fixture, sessionId), DELIVERABLES_PRESENTED_EVENT);
    expect(DELIVERABLES_PRESENTED_DATA.parse(declared)).toMatchObject({
      turn: 1,
      callId: 'p1',
      files: [{ path: join(fixture.workspace, 'report.txt'), description: 'The report' }],
    });
  });

  it('take their file count per call from the workspace settings', async () => {
    fixture = await bootRuntime({
      mount: (ctx) => {
        anchor = ctx;
      },
    });
    await vi.waitFor(() => {
      expect(anchor?.get('agentLoopSettings')).toBeDefined();
    });
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(
      anchor,
      AI_AGENT_LOOP_SETTINGS.parse({ workspace: { present_max_files: 12 } }),
    );
    const sessionId = randomUUID();
    const names = Array.from({ length: 12 }, (_, index) => `file-${String(index)}.txt`);
    await Promise.all(names.map((name) => writeFile(join(fixture?.workspace ?? '', name), name)));
    fixture.model.script(
      {
        kind: 'tool',
        id: 'p1',
        name: 'present',
        input: { files: names.map((path) => ({ path })) },
      },
      { kind: 'text', text: 'presented' },
    );

    await converse(fixture, sessionId, (events) =>
      events.some((event) => event.type === DELIVERABLES_PRESENTED_EVENT),
    );

    const [declared] = recordsOf(eventsOf(fixture, sessionId), DELIVERABLES_PRESENTED_EVENT);
    expect(DELIVERABLES_PRESENTED_DATA.parse(declared).files).toHaveLength(12);
  });

  it('refuse a call above the count from the workspace settings', async () => {
    fixture = await bootRuntime({
      mount: (ctx) => {
        anchor = ctx;
      },
    });
    await vi.waitFor(() => {
      expect(anchor?.get('agentLoopSettings')).toBeDefined();
    });
    if (anchor === undefined) throw new Error('The test mount did not run.');
    await bindAgentLoopSettings(
      anchor,
      AI_AGENT_LOOP_SETTINGS.parse({ workspace: { present_max_files: 1 } }),
    );
    const sessionId = randomUUID();
    await writeFile(join(fixture.workspace, 'a.txt'), 'a');
    await writeFile(join(fixture.workspace, 'b.txt'), 'b');
    fixture.model.script(
      {
        kind: 'tool',
        id: 'p1',
        name: 'present',
        input: { files: [{ path: 'a.txt' }, { path: 'b.txt' }] },
      },
      { kind: 'text', text: 'refused' },
    );

    await converse(fixture, sessionId, () => true);

    expect(recordsOf(eventsOf(fixture, sessionId), DELIVERABLES_PRESENTED_EVENT)).toHaveLength(0);
  });
});
