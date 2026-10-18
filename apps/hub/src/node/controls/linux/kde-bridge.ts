import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { NodeFailureError } from '../../node-failure';
import { variant, type SessionBus } from './dbus-session';
import { runtimeDirectory } from './session-environment';

const NAME = 'org.smarteverything.Node';
const PATH = '/org/smarteverything/Node';
const KWIN = {
  destination: 'org.kde.KWin',
  path: '/Scripting',
  iface: 'org.kde.kwin.Scripting',
} as const;
const FOCUS_SCRIPT = 'smarteverything-focus';
const WATCH_SCRIPT = 'smarteverything-windows-watch';
const WINDOWS_TIMEOUT_MS = 5000;

const FOCUSED = z.tuple([z.string(), z.string()]);
const WINDOWS = z.tuple([z.string(), z.array(variant(z.number().int()))]);
const LOADED = z.tuple([z.number()]);
const WINDOW_LIST = z.tuple([z.string(), z.string()]);
const WINDOWS_CHANGED = z.tuple([z.string()]);
const WINDOW_ROWS = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    desktopFile: z.string(),
    resourceClass: z.string(),
    minimized: z.boolean(),
    active: z.boolean(),
    desktops: z.array(z.string()),
  }),
);

export type BridgeBus = Pick<SessionBus, 'own' | 'serve' | 'call'>;

export type KdeWindow = z.infer<typeof WINDOW_ROWS>[number];

interface Reply<T> {
  readonly answer: Promise<T>;
  readonly drop: () => void;
}

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

const LIST_FIELDS = `({
  id: String(w.internalId),
  title: String(w.caption),
  desktopFile: String(w.desktopFileName || ''),
  resourceClass: String(w.resourceClass || ''),
  minimized: Boolean(w.minimized),
  active: workspace.activeWindow === w,
  desktops: w.desktops.map((d) => String(d.name)),
})`;

const ROWS_SOURCE = `workspace.windowList().filter((w) => w.normalWindow).map((w) => ${LIST_FIELDS})`;

function listSource(request: string): string {
  return `const rows = ${ROWS_SOURCE};
${CALL}, 'WindowList', ${quoted(request)}, JSON.stringify(rows));
`;
}

function actSource(request: string, windowId: string, action: string): string {
  return `const w = workspace.windowList().find((c) => String(c.internalId) === ${quoted(windowId)});
${CALL}, 'Windows', ${quoted(request)}, w ? [w.pid] : []);
if (w) {
  if (${quoted(action)} === 'focus') {
    w.minimized = false;
    workspace.activeWindow = w;
  } else if (${quoted(action)} === 'minimise') {
    w.minimized = true;
  } else {
    w.closeWindow();
  }
}
`;
}

const WATCH_SOURCE = `function changed() {
  ${CALL}, 'WindowsChanged', JSON.stringify(${ROWS_SOURCE}));
}
function watch(w) {
  if (!w.normalWindow) {
    return;
  }
  w.captionChanged.connect(changed);
  w.minimizedChanged.connect(changed);
  w.desktopsChanged.connect(changed);
}
function added(w) {
  watch(w);
  changed();
}
workspace.windowList().forEach(watch);
workspace.windowAdded.connect(added);
workspace.windowRemoved.connect(changed);
workspace.windowActivated.connect(changed);
changed();
`;

function scriptPath(name: string): string {
  return join(runtimeDirectory(), `${name}.js`);
}

export class KdeBridge {
  private readonly waiting = new Map<string, (pids: readonly number[]) => void>();
  private readonly listing = new Map<string, (json: string) => void>();
  private windowsChanged: (() => void) | null = null;
  private watched: readonly KdeWindow[] | null = null;
  private stopServing: (() => void) | null = null;

  constructor(
    private readonly bus: BridgeBus,
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
        WindowList: (body): void => {
          const [request, json] = WINDOW_LIST.parse(body);
          this.listing.get(request)?.(json);
        },
        WindowsChanged: (body): void => {
          const [json] = WINDOWS_CHANGED.parse(body);
          const rows: unknown = JSON.parse(json);
          this.watched = WINDOW_ROWS.parse(rows);
          this.windowsChanged?.();
        },
      },
    );
    await this.load(FOCUS_SCRIPT, FOCUS_SOURCE);
  }

  async stop(): Promise<void> {
    if (this.stopServing === null) {
      return;
    }
    this.stopServing();
    this.stopServing = null;
    this.windowsChanged = null;
    this.watched = null;
    await this.unload(WATCH_SCRIPT);
    await this.unload(FOCUS_SCRIPT);
  }

  async listWindows(): Promise<readonly KdeWindow[]> {
    if (this.watched !== null) {
      return this.watched;
    }
    const request = randomUUID();
    const script = `smarteverything-windows-${request}`;
    const reply = this.reply(this.listing, request);
    try {
      await this.load(script, listSource(request));
      const rows: unknown = JSON.parse(await reply.answer);
      return WINDOW_ROWS.parse(rows);
    } finally {
      reply.drop();
      await this.unload(script);
    }
  }

  async actOnWindow(windowId: string, action: string): Promise<boolean> {
    const request = randomUUID();
    const script = `smarteverything-windows-${request}`;
    const reply = this.reply(this.waiting, request);
    try {
      await this.load(script, actSource(request, windowId, action));
      return (await reply.answer).length > 0;
    } finally {
      reply.drop();
      await this.unload(script);
    }
  }

  async watchWindows(
    onChange: () => void,
    onFailure: (cause: unknown) => void,
  ): Promise<() => void> {
    this.windowsChanged = onChange;
    await this.load(WATCH_SCRIPT, WATCH_SOURCE);
    return (): void => {
      this.windowsChanged = null;
      this.watched = null;
      this.unload(WATCH_SCRIPT).catch(onFailure);
    };
  }

  async windowsOf(appId: string, close: boolean): Promise<readonly number[]> {
    const request = randomUUID();
    const script = `smarteverything-windows-${request}`;
    const reply = this.reply(this.waiting, request);
    try {
      await this.load(script, closeSource(request, appId, close));
      return await reply.answer;
    } finally {
      reply.drop();
      await this.unload(script);
    }
  }

  private reply<T>(registry: Map<string, (value: T) => void>, request: string): Reply<T> {
    let timer: NodeJS.Timeout | null = null;
    const answer = new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        reject(new NodeFailureError('failed', 'The desktop did not answer in time.'));
      }, WINDOWS_TIMEOUT_MS);
      registry.set(request, resolve);
    });
    return {
      answer,
      drop: (): void => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        registry.delete(request);
      },
    };
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
