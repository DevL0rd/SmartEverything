import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DarwinApps } from '../../../src/node/controls/darwin/darwin-apps';
import { DarwinPower } from '../../../src/node/controls/darwin/darwin-power';
import {
  DarwinProcessSource,
  parseCommands,
  parseSweep,
  parseUsers,
} from '../../../src/node/controls/darwin/darwin-processes';
import { darwinVolume } from '../../../src/node/controls/darwin/darwin-volume';
import { fakeRun } from '../fake-run';

describe('Mac power actions', () => {
  it.each([
    ['shut_down', 'osascript -e tell application "System Events" to shut down'],
    ['restart', 'osascript -e tell application "System Events" to restart'],
    ['sign_out', 'osascript -e tell application "System Events" to log out'],
    ['sleep', 'pmset sleepnow'],
    ['lock_screen', 'pmset displaysleepnow'],
  ] as const)('%s runs %s', async (action, command) => {
    const { run, calls } = fakeRun({ [command]: '' });
    await new DarwinPower(run).run(action);
    expect(calls).toStrictEqual([command]);
  });

  it('does not offer hibernate and refuses it', async () => {
    const power = new DarwinPower(fakeRun().run);
    expect(await power.available()).not.toContain('hibernate');
    await expect(power.run('hibernate')).rejects.toMatchObject({ code: 'not_supported' });
  });
});

describe('Mac apps', () => {
  let home = '';

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'hub-mac-apps-'));
    await mkdir(join(home, 'Applications', 'Tool.app'), { recursive: true });
    await mkdir(join(home, 'Applications', 'notes'), { recursive: true });
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  it('lists the .app bundles in the user’s Applications folder by name', async () => {
    const apps = await new DarwinApps(fakeRun().run, home).installed();
    expect(apps.filter((app) => app.id.startsWith(home))).toStrictEqual([
      { id: join(home, 'Applications', 'Tool.app'), name: 'Tool', comment: null, icon: null },
    ]);
  });

  it('opens a listed app by its bundle path', async () => {
    const path = join(home, 'Applications', 'Tool.app');
    const { run, calls } = fakeRun({ [`open ${path}`]: '' });
    await new DarwinApps(run, home).open(path);
    expect(calls).toStrictEqual([`open ${path}`]);
  });

  it('refuses a path that is not a listed app', async () => {
    const { run, calls } = fakeRun();
    await expect(new DarwinApps(run, home).open('/etc/passwd')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(calls).toStrictEqual([]);
  });

  it('says closing an app is not available yet', async () => {
    await expect(new DarwinApps(fakeRun().run, home).close()).rejects.toMatchObject({
      code: 'not_supported',
    });
  });

  it('ignores a folder that does not exist', async () => {
    await rm(join(home, 'Applications'), { recursive: true });
    expect(
      (await new DarwinApps(fakeRun().run, home).installed()).every(
        (app) => !app.id.startsWith(home),
      ),
    ).toBe(true);
    await symlink(home, join(home, 'loop'));
  });
});

const PS_TABLE = `  1     0   0.0   9216   0 Sat Oct 17 21:02:11 2026 /sbin/launchd
 412     1  12.5 204800 501 Sat Oct 17 21:05:40 2026 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=renderer
 odd line
`;
const PS_COMM = `    1 /sbin/launchd
  412 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
`;
const DSCL = 'root  0\ndev  501\n_windowserver  88\n';

describe('Mac programs', () => {
  it('maps user numbers to account names', () => {
    expect(parseUsers(DSCL).get('501')).toBe('dev');
  });

  it('takes the executable name from comm, even with spaces', () => {
    expect(parseCommands(PS_COMM).get(412)).toBe(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    );
  });

  it('reads one row per program and skips lines it cannot read', () => {
    const rows = parseSweep(PS_TABLE, parseCommands(PS_COMM), parseUsers(DSCL));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      pid: 412,
      ppid: 1,
      name: 'Google Chrome',
      user: 'dev',
      memoryBytes: 204800 * 1024,
      cpuPercentOfOneCore: 12.5,
      command: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --type=renderer',
    });
    expect(rows[1]?.start).toBe(Date.parse('Sat Oct 17 21:05:40 2026'));
  });

  it('shows the user number when the account is unknown', () => {
    const rows = parseSweep(PS_TABLE, parseCommands(PS_COMM), new Map());
    expect(rows[1]?.user).toBe('501');
  });

  it('reads the user list only once', async () => {
    const { run, calls } = fakeRun({
      'ps -Aww -o pid=,ppid=,pcpu=,rss=,uid=,lstart=,command=': PS_TABLE,
      'ps -Aww -o pid=,comm=': PS_COMM,
      'dscl . -list /Users UniqueID': DSCL,
    });
    const source = new DarwinProcessSource(run);
    await source.sweep();
    await source.sweep();
    expect(calls.filter((call) => call.startsWith('dscl'))).toHaveLength(1);
  });
});

describe('the Mac ring volume', () => {
  it('reads, raises and restores through osascript', async () => {
    const { run, calls } = fakeRun({
      'osascript -e output volume of (get volume settings)': '42\n',
      'osascript -e output muted of (get volume settings)': 'true\n',
      'osascript -e set volume without output muted': '',
      'osascript -e set volume output volume 100': '',
      'osascript -e set volume output volume 42': '',
      'osascript -e set volume with output muted': '',
    });
    const volume = darwinVolume(run);
    expect(await volume.current()).toStrictEqual({ volume: 42, muted: true });
    await volume.raise();
    await volume.restore({ volume: 42, muted: true });
    expect(calls.slice(-4)).toStrictEqual([
      'osascript -e set volume without output muted',
      'osascript -e set volume output volume 100',
      'osascript -e set volume output volume 42',
      'osascript -e set volume with output muted',
    ]);
  });
});
