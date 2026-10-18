import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installKwinScript } from '../src/overlay/kwin-script-file.js';
import { SessionKwin } from '../src/overlay/kwin-overlay.js';
import { fakeBus } from './support/kwin-bus.js';

let root = '';
let source = '';
let userData = '';

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'kwin-script-'));
  source = path.join(root, 'asar', 'overlay-kwin.js');
  userData = path.join(root, 'userData', 'overlay');
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, 'v1');
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('KWin script file', () => {
  it('writes the script to a real readable file', async () => {
    const target = await installKwinScript(source, userData);
    expect(target).toBe(path.join(userData, 'overlay.js'));
    expect(await readFile(target, 'utf8')).toBe('v1');
    expect((await stat(target)).mode & 0o777).toBe(0o644);
  });

  it('leaves an identical file untouched', async () => {
    const target = await installKwinScript(source, userData);
    const before = (await stat(target)).mtimeMs;
    await installKwinScript(source, userData);
    expect((await stat(target)).mtimeMs).toBe(before);
  });

  it('replaces a stale file after an update and leaves no staging file', async () => {
    const target = await installKwinScript(source, userData);
    await writeFile(source, 'v2');
    await installKwinScript(source, userData);
    expect(await readFile(target, 'utf8')).toBe('v2');
    expect(await readdir(userData)).toEqual(['overlay.js']);
  });

  it('fails clearly when the packaged script is missing', async () => {
    await expect(installKwinScript(path.join(root, 'none.js'), userData)).rejects.toThrow('ENOENT');
  });
});

describe('KWin session with the installed script', () => {
  it('hands KWin the real file path', async () => {
    const rig = fakeBus({ running: true, ids: [4] });
    await new SessionKwin(
      () => installKwinScript(source, userData),
      () => rig.bus,
    ).load();
    expect(rig.calls.find((call) => call.member === 'loadScript')?.body[0]).toBe(
      path.join(userData, 'overlay.js'),
    );
  });
});
