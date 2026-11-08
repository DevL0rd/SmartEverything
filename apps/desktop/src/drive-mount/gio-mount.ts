import type { RunCommand } from '../service/system.js';

const LOOPBACK = '127.0.0.1';
const LOCAL_PATH_LINE = /^\s*local path:\s*(.+)$/m;

export class GioMountUrlError extends Error {
  readonly received: string;

  constructor(received: string) {
    super(
      `a gio WebDAV mount needs the loopback proxy address http://${LOOPBACK}:<port>/<session>/; received ${received}`,
    );
    this.name = 'GioMountUrlError';
    this.received = received;
  }
}

export class GioLocalPathError extends Error {
  constructor() {
    super(
      'gio mounted the WebDAV folder but reported no local path; the gvfs FUSE daemon (gvfsd-fuse) must be running for the folder to be browsable by other programs',
    );
    this.name = 'GioLocalPathError';
  }
}

export interface GioMount {
  readonly uri: string;
  readonly localPath: string;
}

export function davUri(proxyUrl: string): string {
  const parsed = new URL(proxyUrl);
  if (parsed.protocol !== 'http:' || parsed.hostname !== LOOPBACK) {
    throw new GioMountUrlError(proxyUrl);
  }
  return `dav://${parsed.host}${parsed.pathname}`;
}

export async function unmountGio(run: RunCommand, uri: string): Promise<void> {
  await run('gio', ['mount', '-u', uri]);
}

async function localPathOf(run: RunCommand, uri: string): Promise<string> {
  const { stdout } = await run('gio', ['info', '-a', 'standard::name', uri]);
  const path = LOCAL_PATH_LINE.exec(stdout)?.[1];
  if (path === undefined) throw new GioLocalPathError();
  return path.trim();
}

export async function mountGio(run: RunCommand, proxyUrl: string): Promise<GioMount> {
  const uri = davUri(proxyUrl);
  await run('gio', ['mount', uri]);
  try {
    return { uri, localPath: await localPathOf(run, uri) };
  } catch (cause) {
    await unmountGio(run, uri);
    throw cause;
  }
}
