import { describe, expect, it } from 'vitest';
import { CommandFailedError, type RunCommand } from '../../src/service/system.js';
import {
  GioLocalPathError,
  GioMountUrlError,
  davUri,
  mountGio,
  unmountGio,
} from '../../src/drive-mount/gio-mount.js';

const PROXY = 'http://127.0.0.1:40123/0123456789abcdef0123456789abcdef/';
const URI = 'dav://127.0.0.1:40123/0123456789abcdef0123456789abcdef/';
const INFO = 'display name: share\nlocal path: /run/user/1000/gvfs/dav:host=127.0.0.1\n';

function shell(replies: Readonly<Record<string, string | Error>>): {
  readonly run: RunCommand;
  readonly calls: string[];
} {
  const calls: string[] = [];
  const run: RunCommand = (file, args) => {
    const line = [file, ...args].join(' ');
    calls.push(line);
    const key = Object.keys(replies).find((prefix) => line.startsWith(prefix));
    const reply = key === undefined ? '' : replies[key];
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({ stdout: reply ?? '' });
  };
  return { run, calls };
}

describe('gio WebDAV mount', () => {
  it('turns the loopback proxy address into a dav address', () => {
    expect(davUri(PROXY)).toBe(URI);
  });

  it('refuses an address that is not the loopback proxy', () => {
    expect(() => davUri('http://192.168.1.5:8080/x/')).toThrow(GioMountUrlError);
    expect(() => davUri('https://127.0.0.1:8080/x/')).toThrow(GioMountUrlError);
  });

  it('mounts and reports where the folder appears', async () => {
    const { run, calls } = shell({ 'gio info': INFO });
    expect(await mountGio(run, PROXY)).toEqual({
      uri: URI,
      localPath: '/run/user/1000/gvfs/dav:host=127.0.0.1',
    });
    expect(calls).toEqual([`gio mount ${URI}`, `gio info -a standard::name ${URI}`]);
  });

  it('unmounts again when no local path is reported', async () => {
    const { run, calls } = shell({ 'gio info': 'display name: share\n' });
    await expect(mountGio(run, PROXY)).rejects.toThrow(GioLocalPathError);
    expect(calls).toContain(`gio mount -u ${URI}`);
  });

  it('lets a failed mount surface and does not unmount what never mounted', async () => {
    const failure = new CommandFailedError(
      'gio',
      1,
      'exited with code 1',
      'Operation not supported',
    );
    const { run, calls } = shell({ 'gio mount': failure });
    await expect(mountGio(run, PROXY)).rejects.toBe(failure);
    expect(calls).toEqual([`gio mount ${URI}`]);
  });

  it('unmounts by address', async () => {
    const { run, calls } = shell({});
    await unmountGio(run, URI);
    expect(calls).toEqual([`gio mount -u ${URI}`]);
  });
});
