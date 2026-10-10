import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import type { SessionBus } from './dbus-session';
import { runtimeDirectory } from './session-environment';

const NAME = 'org.smarteverything.Node';
const PATH = '/org/smarteverything/Node';
const KWIN = {
  destination: 'org.kde.KWin',
  path: '/Scripting',
  iface: 'org.kde.kwin.Scripting',
} as const;
const FOCUS_SCRIPT = 'smarteverything-focus';
const WINDOWS_TIMEOUT_MS = 5000;

const FOCUSED = z.tuple([z.string(), z.string()]);
const WINDOWS = z.tuple([z.string(), z.array(z.number().int())]);
const LOADED = z.tuple([z.number()]);

export interface FocusedWindow {
  readonly desktopFile: string;
  readonly resourceClass: string;
}

function quoted(text: string): string {
  return JSON.stringify(text);
}

const CALL = `callDBus(${quoted(NAME)}, ${quoted(PATH)}, ${quoted(NAME)}`;

const FOCUS_SOURCE = `function report(w) {
  ${CALL}, 'Focused', w ? String(w.desktopFileName || '') : '', w ? String(w.resourceClass || '') : '');
}
workspace.windowActivated.connect(report);
report(workspace.activeWindow);
`;

function closeSource(request: string, appId: string, close: boolean): string {
  return `const found = workspace.windowList().filter((w) => w.desktopFileName === ${quoted(appId)});
${CALL}, 'Windows', ${quoted(request)}, found.map((w) => w.pid));
${close ? 'found.forEach((w) => w.closeWindow());' : ''}
`;
}

function scriptPath(name: string): string {
  return join(runtimeDirectory(), `${name}.js`);
}

export class KdeBridge {
  private readonly waiting = new Map<string, (pids: readonly number[]) => void>();
  private stopServing: (() => void) | null = null;

  constructor(
    private readonly bus: SessionBus,
    private readonly focused: (window: FocusedWindow | null) => void,
  ) {}

  async start(): Promise<void> {
    await this.bus.own(NAME);
    this.stopServing = this.bus.serve(
      { path: PATH, iface: NAME },
      {
        Focused: (body): void => {
          const [desktopFile, resourceClass] = FOCUSED.parse(body);
          this.focused(resourceClass === '' ? null : { desktopFile, resourceClass });
        },
        Windows: (body): void => {
          const [request, pids] = WINDOWS.parse(body);
          this.waiting.get(request)?.(pids);
        },
      },
    );
    await this.load(FOCUS_SCRIPT, FOCUS_SOURCE);
  }

  async stop(): Promise<void> {
    this.stopServing?.();
    this.stopServing = null;
    await this.unload(FOCUS_SCRIPT);
  }

  async windowsOf(appId: string, close: boolean): Promise<readonly number[]> {
    const request = randomUUID();
    const script = `smarteverything-windows-${request}`;
    const answered = new Promise<readonly number[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new NodeFailureError('failed', 'The desktop did not answer in time.'));
      }, WINDOWS_TIMEOUT_MS);
      this.waiting.set(request, (pids) => {
        clearTimeout(timer);
        resolve(pids);
      });
    });
    try {
      await this.load(script, closeSource(request, appId, close));
      return await answered;
    } finally {
      this.waiting.delete(request);
      await this.unload(script);
    }
  }

  private async load(name: string, source: string): Promise<void> {
    const path = scriptPath(name);
    await this.unload(name);
    await writeFile(path, source, { mode: 0o600 });
    const [id] = LOADED.parse(
      await this.bus.call({ ...KWIN, member: 'loadScript', signature: 'ss', body: [path, name] }),
    );
    if (id < 0) {
      throw new NodeFailureError(
        'failed',
        'The desktop refused the SmartEverything window script.',
      );
    }
    await this.bus.call({ ...KWIN, member: 'start' });
  }

  private async unload(name: string): Promise<void> {
    await this.bus.call({ ...KWIN, member: 'unloadScript', signature: 's', body: [name] });
    await rm(scriptPath(name), { force: true });
  }
}
