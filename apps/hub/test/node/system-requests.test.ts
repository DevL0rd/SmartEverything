import type { SystemState } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linuxSystemControls } from '../../src/node/controls/linux/linux-system';
import { ProcessDetails } from '../../src/node/controls/linux/process-detail';
import { handleSystemRequest } from '../../src/node/system-requests';
import { fakeRun } from './fake-run';

let folder = '';

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'se-proc-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const STAT_TAIL = (nice: number): string =>
  `1 1234 1234 0 -1 4194560 1000 0 0 0 150 50 0 0 20 ${String(nice)} 7 0 5000 123456789 2500 18446744073709551615 1 1 0`;

interface Fake {
  readonly pid: number;
  readonly name: string;
  readonly ppid: number;
  readonly nice: number;
  readonly uid: number;
}

async function addProcess(fake: Fake): Promise<void> {
  const { pid, name, ppid, nice, uid } = fake;
  const base = join(folder, 'proc', String(pid));
  await mkdir(join(base, 'fd'), { recursive: true });
  await writeFile(
    join(base, 'stat'),
    `${String(pid)} (${name}) S ${String(ppid)} ${STAT_TAIL(nice).split(' ').slice(1).join(' ')}`,
  );
  await writeFile(join(base, 'status'), `Name:\t${name}\nUid:\t${String(uid)}\t${String(uid)}\n`);
  await writeFile(join(base, 'cmdline'), `/usr/bin/${name}\0--flag\0`);
  await writeFile(join(base, 'cgroup'), '0::/user.slice/app.scope\n');
  await writeFile(join(base, 'comm'), `${name}\n`);
  await symlink('/usr/bin/tool', join(base, 'exe'));
  await symlink('/home/me', join(base, 'cwd'));
  await symlink('socket:[1]', join(base, 'fd', '3'));
  await symlink('/tmp/x', join(base, 'fd', '4'));
}

async function world(): Promise<{ details: ProcessDetails; niceCalls: [number, number][] }> {
  await mkdir(join(folder, 'proc'), { recursive: true });
  await writeFile(join(folder, 'proc', 'stat'), 'cpu 1 2 3\nbtime 1000000\n');
  await writeFile(
    join(folder, 'passwd'),
    'me:x:1000:1000::/home/me:/bin/sh\nroot:x:0:0::/root:/bin/sh\n',
  );
  await addProcess({ pid: 100, name: 'editor', ppid: 1, nice: 0, uid: 1000 });
  await addProcess({ pid: 101, name: 'helper (x)', ppid: 100, nice: 5, uid: 1000 });
  await addProcess({ pid: 1, name: 'init', ppid: 0, nice: 0, uid: 0 });
  const niceCalls: [number, number][] = [];
  const details = new ProcessDetails({
    proc: join(folder, 'proc'),
    passwd: join(folder, 'passwd'),
    uid: (): number => 1000,
    setNice: (pid, nice): void => {
      niceCalls.push([pid, nice]);
    },
  });
  return { details, niceCalls };
}

describe('process detail', () => {
  it('describes a program with its parent, children, user, files and sockets', async () => {
    const { details } = await world();
    expect(await details.detail(100)).toEqual({
      pid: 100,
      name: 'editor',
      command: '/usr/bin/editor --flag',
      executable: '/usr/bin/tool',
      workingDirectory: '/home/me',
      startedAt: new Date((1_000_000 + 50) * 1000).toISOString(),
      ppid: 1,
      parentName: 'init',
      children: [{ pid: 101, name: 'helper (x)' }],
      user: 'me',
      threads: 7,
      openFiles: 2,
      sockets: 1,
      niceness: 0,
      cgroup: '/user.slice/app.scope',
      own: true,
    });
  });

  it('marks other users programs as not own', async () => {
    const { details } = await world();
    expect((await details.detail(1)).own).toBe(false);
  });

  it('reports a finished program as gone', async () => {
    const { details } = await world();
    await expect(details.detail(999)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('lowers priority of an own program and refuses raising it', async () => {
    const { details, niceCalls } = await world();
    await details.prioritise(100, 10);
    expect(niceCalls).toEqual([[100, 10]]);
    await expect(details.prioritise(101, 1)).rejects.toMatchObject({ code: 'not_permitted' });
    expect(niceCalls).toHaveLength(1);
  });

  it('refuses to change priority of someone else', async () => {
    const { details, niceCalls } = await world();
    await expect(details.prioritise(1, 19)).rejects.toMatchObject({ code: 'not_own' });
    expect(niceCalls).toEqual([]);
  });
});

describe('system requests', () => {
  const OFF = fakeRun({});

  function controls(): ReturnType<typeof linuxSystemControls> {
    return linuxSystemControls({
      log: new Logger('hub.node-system'),
      run: OFF.run,
      home: join(folder, 'home'),
      dataHome: join(folder, 'data'),
      usbRoot: join(folder, 'usb'),
      globalAutostart: [],
      inhibitor: {
        inhibit: () => Promise.reject(new Error('not on this test')),
        release: () => Promise.resolve(),
      },
    });
  }

  it('answers the system verb on a computer without any of the tools', async () => {
    await mkdir(join(folder, 'home'));
    const state = await handleSystemRequest({ verb: 'system' }, controls());
    const expected: Pick<
      SystemState,
      'battery' | 'powerMode' | 'dnd' | 'keyboard' | 'wifi' | 'bluetooth'
    > = {
      battery: null,
      powerMode: null,
      dnd: null,
      keyboard: null,
      wifi: null,
      bluetooth: null,
    };
    expect(state).toMatchObject(expected);
  });

  it('answers service and startup lists as empty when the tools are missing', async () => {
    await mkdir(join(folder, 'home'));
    expect(await handleSystemRequest({ verb: 'services' }, controls())).toEqual({
      services: [],
      timers: [],
    });
    expect(await handleSystemRequest({ verb: 'startup' }, controls())).toHaveProperty('entries');
  });

  it('refuses a setting the computer cannot do with a not_supported failure', async () => {
    await mkdir(join(folder, 'home'));
    await expect(
      handleSystemRequest(
        { verb: 'system_set', change: { action: 'power_mode', mode: 'balanced' } },
        controls(),
      ),
    ).rejects.toMatchObject({ code: 'not_supported' });
    await expect(
      handleSystemRequest(
        { verb: 'system_set', change: { action: 'bluetooth', enabled: true } },
        controls(),
      ),
    ).rejects.toMatchObject({ code: 'not_supported' });
  });

  it('offers only the features this computer can do', async () => {
    await mkdir(join(folder, 'home'));
    expect(await controls().features()).toEqual([
      'startup_apps',
      'process_priority',
      'files',
      'files_write',
    ]);
  });

  it('creates a folder, trashes it and restores it through the verbs', async () => {
    await mkdir(join(folder, 'home'));
    const path = join(folder, 'home', 'Made');
    const made = await handleSystemRequest(
      { verb: 'file_write', change: { action: 'new_folder', path } },
      controls(),
    );
    expect(made).toMatchObject({ done: [{ newPath: path }], failed: [] });
    const trashed = await handleSystemRequest(
      { verb: 'file_write', change: { action: 'trash', paths: [path] } },
      controls(),
    );
    expect(trashed).toMatchObject({ done: [{ trashId: 'Made' }] });
    const restored = await handleSystemRequest(
      { verb: 'file_write', change: { action: 'restore', items: ['Made'] } },
      controls(),
    );
    expect(restored).toMatchObject({ done: [{ path }] });
  });

  it('uploads and reads back properties through the verbs', async () => {
    await mkdir(join(folder, 'home'));
    const path = join(folder, 'home', 'up.txt');
    const sent = await handleSystemRequest(
      {
        verb: 'file_upload',
        chunk: {
          path,
          start: 0,
          data: Buffer.from('hi').toString('base64'),
          final: true,
          replace: false,
        },
      },
      controls(),
    );
    expect(sent).toEqual({ path, size: 2, complete: true });
    expect(await handleSystemRequest({ verb: 'file_properties', path }, controls())).toMatchObject({
      size: 2,
      kind: 'file',
    });
  });
});
