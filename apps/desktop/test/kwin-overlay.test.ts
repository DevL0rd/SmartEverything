import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { Message, MessageType } from '@jellybrick/dbus-next';
import {
  KWIN_SCRIPT_NAME,
  KwinScriptSilentError,
  SessionKwin,
} from '../src/overlay/kwin-overlay.js';
import { READY_NAME, READY_PATH } from '../src/overlay/kwin-events.js';
import { fakeBus, type BusRig } from './support/kwin-bus.js';

const SCRIPT = readFileSync(
  path.join(import.meta.dirname, '../src/overlay/kwin/overlay.js'),
  'utf8',
);

class Signal {
  readonly handlers: ((...values: unknown[]) => void)[] = [];
  connect(handler: (...values: unknown[]) => void): void {
    this.handlers.push(handler);
  }
  disconnect(handler: (...values: unknown[]) => void): void {
    this.handlers.splice(this.handlers.indexOf(handler), 1);
  }
  emit(...values: unknown[]): void {
    this.handlers.forEach((handler) => {
      handler(...values);
    });
  }
}

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

class FakeWindow {
  skipTaskbar = false;
  skipSwitcher = false;
  skipPager = false;
  keepAbove = false;
  onAllDesktops = false;
  excludeFromCapture = false;
  assignments = 0;
  fullScreen = false;
  output: Screen = HDMI;
  readonly captionChanged = new Signal();
  readonly frameGeometryChanged = new Signal();
  readonly fullScreenChanged = new Signal();
  readonly interactiveMoveResizeStarted = new Signal();
  readonly interactiveMoveResizeFinished = new Signal();
  #geometry: Geometry;
  #caption: string;

  constructor(caption: string, geometry: Geometry = { x: 10, y: 10, width: 500, height: 112 }) {
    this.#caption = caption;
    this.#geometry = geometry;
  }
  get caption(): string {
    return this.#caption;
  }
  set caption(value: string) {
    this.#caption = value;
    this.captionChanged.emit();
  }
  get frameGeometry(): Geometry {
    return this.#geometry;
  }
  set frameGeometry(value: Geometry) {
    this.assignments += 1;
    this.#geometry = value;
    this.frameGeometryChanged.emit();
  }
}

interface Screen {
  readonly name: string;
  readonly geometry: Geometry;
}

const HDMI: Screen = { name: 'HDMI-A-1', geometry: { x: 0, y: 0, width: 5120, height: 1440 } };
const DP3: Screen = { name: 'DP-3', geometry: { x: 5120, y: 0, width: 1456, height: 1312 } };
const SCREENS: readonly Screen[] = [HDMI, DP3];

const AREAS: Record<string, Geometry> = {
  'HDMI-A-1': { x: 0, y: 0, width: 5120, height: 1400 },
  'DP-3': { x: 5120, y: 30, width: 1456, height: 1280 },
};

interface FakeWorkspace {
  screens: readonly Screen[];
  activeScreen: Screen;
  currentDesktop: string;
  activeWindow: FakeWindow | null;
  windowAdded: Signal;
  windowRemoved: Signal;
  windowList(): FakeWindow[];
  clientArea(kind: string, output: Screen): Geometry;
}

interface Booted {
  readonly workspace: FakeWorkspace;
  readonly add: (window: FakeWindow) => void;
  readonly remove: (window: FakeWindow) => void;
  readonly announced: unknown[][];
}

function boot(existing: FakeWindow[] = []): Booted {
  const added = new Signal();
  const removed = new Signal();
  const announced: unknown[][] = [];
  const workspace: FakeWorkspace = {
    screens: SCREENS,
    activeScreen: DP3,
    currentDesktop: 'desktop',
    activeWindow: null,
    windowAdded: added,
    windowRemoved: removed,
    windowList: (): FakeWindow[] => existing,
    clientArea: (_kind, output): Geometry =>
      AREAS[output.name] ?? { x: 0, y: 0, width: 0, height: 0 },
  };
  vm.runInNewContext(SCRIPT, {
    workspace,
    KWin: { PlacementArea: 'placement' },
    callDBus: (...values: unknown[]): void => {
      announced.push(values);
    },
  });
  return {
    workspace,
    announced,
    add: (window: FakeWindow): void => {
      existing.push(window);
      added.emit(window);
    },
    remove: (window: FakeWindow): void => {
      existing.splice(existing.indexOf(window), 1);
      removed.emit(window);
    },
  };
}

const caption = (tokens: string): string => `SmartEverything voice ${tokens}`;

describe('overlay KWin script', () => {
  it('announces itself to the app once it runs', () => {
    const { announced } = boot();
    expect(announced).toEqual([[READY_NAME, READY_PATH, READY_NAME, 'Ready']]);
  });

  it('leaves every other window alone', () => {
    const { add } = boot();
    const other = new FakeWindow('Terminal');
    add(other);
    expect(other.skipTaskbar).toBe(false);
    expect(other.assignments).toBe(0);
  });

  it('keeps an overlay window out of tiling, the switcher and screen capture', () => {
    const { add } = boot();
    const window = new FakeWindow(caption('pill bottom-centre 0,0 0 48'));
    add(window);
    expect([
      window.skipTaskbar,
      window.skipSwitcher,
      window.skipPager,
      window.keepAbove,
      window.onAllDesktops,
      window.excludeFromCapture,
    ]).toEqual([true, true, true, true, true, true]);
  });

  it('adopts overlay windows that exist when the script starts', () => {
    const window = new FakeWindow(caption('glow bottom-centre 0,0 0 0'), {
      x: 0,
      y: 0,
      width: 5120,
      height: 140,
    });
    boot([window]);
    expect(window.skipTaskbar).toBe(true);
  });

  it('centres a bottom pill above the work area with its inset', () => {
    const { add } = boot();
    const window = new FakeWindow(caption('pill bottom-centre 0,0 0 48'));
    add(window);
    expect(window.frameGeometry).toEqual({ x: 2310, y: 1400 - 112 - 48, width: 500, height: 112 });
  });

  it('aligns left and right anchors to the work area edges of the named output', () => {
    const { add } = boot();
    const left = new FakeWindow(caption('pill bottom-left 5120,0 0 0'));
    const right = new FakeWindow(caption('pill bottom-right 5120,0 0 0'));
    add(left);
    add(right);
    expect(left.frameGeometry.x).toBe(5120 + 12);
    expect(right.frameGeometry.x).toBe(5120 + 1456 - 500 - 12);
    expect(left.frameGeometry.y).toBe(30 + 1280 - 112);
  });

  it('measures a top anchor from the top of the work area', () => {
    const { add } = boot();
    const window = new FakeWindow(caption('pill top-centre 5120,0 0 38'));
    add(window);
    expect(window.frameGeometry.y).toBe(30 + 38);
  });

  it('uses the active screen for the active token and for an unknown origin', () => {
    const { add } = boot();
    const active = new FakeWindow(caption('pill bottom-left active 0 0'));
    const unknown = new FakeWindow(caption('pill bottom-left 9999,9999 0 0'));
    add(active);
    add(unknown);
    expect(active.frameGeometry.x).toBe(5120 + 12);
    expect(unknown.frameGeometry.x).toBe(5120 + 12);
  });

  it('keeps the screen it chose while the overlay is shown', () => {
    const { add, workspace } = boot();
    const window = new FakeWindow(caption('pill bottom-left active 0 0'));
    add(window);
    workspace.activeScreen = HDMI;
    window.caption = caption('pill bottom-right active 0 0');
    expect(window.frameGeometry.x).toBe(5120 + 1456 - 500 - 12);
  });

  it('stretches the glow across the whole work area of its output', () => {
    const { add } = boot();
    const glow = new FakeWindow(caption('glow bottom-centre 0,0 0 0'), {
      x: 40,
      y: 40,
      width: 2000,
      height: 140,
    });
    add(glow);
    expect(glow.frameGeometry).toEqual({ x: 0, y: 1400 - 140, width: 5120, height: 140 });
  });

  it('moves again when the caption or the size changes and never when already in place', () => {
    const { add } = boot();
    const window = new FakeWindow(caption('pill bottom-centre 0,0 0 48'));
    add(window);
    const placed = window.assignments;
    window.frameGeometryChanged.emit();
    expect(window.assignments).toBe(placed);
    window.caption = caption('pill bottom-left 0,0 0 48');
    expect(window.frameGeometry.x).toBe(12);
    const resized = window.assignments;
    window.frameGeometry = { ...window.frameGeometry, width: 700 };
    expect(window.assignments).toBe(resized + 1);
    expect(window.frameGeometry.x).toBe(12);
  });

  it('waits for a caption when the window arrives untitled', () => {
    const { add } = boot();
    const window = new FakeWindow('');
    add(window);
    expect(window.skipTaskbar).toBe(false);
    window.caption = caption('tray bottom-centre 0,0 0 122');
    expect(window.skipTaskbar).toBe(true);
    expect(window.frameGeometry.y).toBe(1400 - 112 - 122);
  });

  it('activates the window on focus 1 and restores the previous one on focus 0', () => {
    const { add, workspace } = boot();
    const previous = new FakeWindow('Editor');
    workspace.activeWindow = previous;
    const tray = new FakeWindow(caption('tray bottom-centre 0,0 0 122'));
    add(tray);
    expect(workspace.activeWindow).toBe(previous);
    tray.caption = caption('tray bottom-centre 0,0 1 122');
    expect(workspace.activeWindow).toBe(tray);
    tray.caption = caption('tray bottom-centre 0,0 0 122');
    expect(workspace.activeWindow).toBe(previous);
  });

  it('does not pull focus back when the user already moved on', () => {
    const { add, workspace } = boot();
    const previous = new FakeWindow('Editor');
    const elsewhere = new FakeWindow('Browser');
    workspace.activeWindow = previous;
    const tray = new FakeWindow(caption('tray bottom-centre 0,0 1 122'));
    add(tray);
    workspace.activeWindow = elsewhere;
    tray.caption = caption('tray bottom-centre 0,0 0 122');
    expect(workspace.activeWindow).toBe(elsewhere);
  });
});

const CALLS = (announced: unknown[][], member: string): unknown[][] =>
  announced.filter((call) => call[3] === member);

describe('overlay KWin script fullscreen and dragging', () => {
  it('tells the app when a fullscreen window appears on the output of the bar and when it ends', () => {
    const { add, announced } = boot();
    add(new FakeWindow(caption('pill bottom-centre 0,0 0 60')));
    const video = new FakeWindow('Video');
    add(video);
    video.fullScreen = true;
    video.fullScreenChanged.emit();
    expect(CALLS(announced, 'Fullscreen')).toEqual([
      [READY_NAME, READY_PATH, READY_NAME, 'Fullscreen', true],
    ]);
    video.fullScreenChanged.emit();
    expect(CALLS(announced, 'Fullscreen')).toHaveLength(1);
    video.fullScreen = false;
    video.fullScreenChanged.emit();
    expect(CALLS(announced, 'Fullscreen').at(-1)).toEqual([
      READY_NAME,
      READY_PATH,
      READY_NAME,
      'Fullscreen',
      false,
    ]);
  });

  it('ignores a fullscreen window on another output', () => {
    const { add, announced } = boot();
    add(new FakeWindow(caption('pill bottom-centre 0,0 0 60')));
    const other = new FakeWindow('Video');
    other.output = DP3;
    other.fullScreen = true;
    add(other);
    other.fullScreenChanged.emit();
    expect(CALLS(announced, 'Fullscreen')).toHaveLength(0);
  });

  it('reports a fullscreen window that was already there when the bar appears', () => {
    const video = new FakeWindow('Video');
    video.fullScreen = true;
    const { add, announced } = boot([video]);
    add(new FakeWindow(caption('pill bottom-centre 0,0 0 60')));
    expect(CALLS(announced, 'Fullscreen')).toHaveLength(1);
  });

  it('lets the user move the bar and reports where it was dropped as fractions of the work area', () => {
    const { add, announced } = boot();
    const pill = new FakeWindow(caption('pill bottom-centre 0,0 0 60'));
    add(pill);
    pill.interactiveMoveResizeStarted.emit();
    pill.frameGeometry = { x: 1000, y: 200, width: 500, height: 100 };
    expect(pill.frameGeometry.x).toBe(1000);
    pill.interactiveMoveResizeFinished.emit();
    expect(CALLS(announced, 'Moved')).toEqual([
      [READY_NAME, READY_PATH, READY_NAME, 'Moved', (1000 + 250) / 5120, (200 + 50) / 1400],
    ]);
  });

  it('does not report a moved tray', () => {
    const { add, announced } = boot();
    const tray = new FakeWindow(caption('tray bottom-centre 0,0 0 134'));
    add(tray);
    tray.interactiveMoveResizeStarted.emit();
    tray.interactiveMoveResizeFinished.emit();
    expect(CALLS(announced, 'Moved')).toHaveLength(0);
  });

  it('places the bar at a free position and stacks the tray beside it', () => {
    const { add } = boot();
    const pill = new FakeWindow(caption('pill free@0.5000,0.2000 0,0 0 60'), {
      x: 0,
      y: 0,
      width: 500,
      height: 100,
    });
    add(pill);
    expect(pill.frameGeometry).toEqual({ x: 2310, y: 230, width: 500, height: 100 });
    const tray = new FakeWindow(caption('tray free@0.5000,0.2000 0,0 0 134'), {
      x: 0,
      y: 0,
      width: 440,
      height: 300,
    });
    add(tray);
    expect(tray.frameGeometry).toEqual({ x: 2340, y: 230 + 100 + 10, width: 440, height: 300 });
  });

  it('puts the tray above a bar in the lower half and keeps a free bar inside the work area', () => {
    const { add } = boot();
    const pill = new FakeWindow(caption('pill free@1.0000,1.0000 0,0 0 60'), {
      x: 0,
      y: 0,
      width: 500,
      height: 100,
    });
    add(pill);
    expect(pill.frameGeometry).toEqual({ x: 4620, y: 1300, width: 500, height: 100 });
    const tray = new FakeWindow(caption('tray free@1.0000,1.0000 0,0 0 134'), {
      x: 0,
      y: 0,
      width: 440,
      height: 300,
    });
    add(tray);
    expect(tray.frameGeometry.y).toBe(1300 - 10 - 300);
  });
});

describe('overlay KWin script lifetime', () => {
  it('hooks an untitled window once and lets go when it gets a user caption', () => {
    const { add } = boot();
    const untitled = new FakeWindow('');
    add(untitled);
    add(untitled);
    expect(untitled.captionChanged.handlers).toHaveLength(1);
    untitled.caption = 'Terminal';
    expect(untitled.captionChanged.handlers).toHaveLength(0);
  });

  it('stops waiting for the caption of a window that closes untitled', () => {
    const { add, remove } = boot();
    const untitled = new FakeWindow('');
    add(untitled);
    remove(untitled);
    expect(untitled.captionChanged.handlers).toHaveLength(0);
  });

  it('gives focus back to the previous window when the focused tray closes', () => {
    const { add, remove, workspace } = boot();
    const previous = new FakeWindow('Editor');
    add(previous);
    workspace.activeWindow = previous;
    const tray = new FakeWindow(caption('tray bottom-centre 0,0 1 122'));
    add(tray);
    expect(workspace.activeWindow).toBe(tray);
    workspace.activeWindow = null;
    remove(tray);
    expect(workspace.activeWindow).toBe(previous);
  });

  it('does not activate a previous window that has closed too', () => {
    const { add, remove, workspace } = boot();
    const previous = new FakeWindow('Editor');
    add(previous);
    workspace.activeWindow = previous;
    const tray = new FakeWindow(caption('tray bottom-centre 0,0 1 122'));
    add(tray);
    remove(previous);
    workspace.activeWindow = null;
    remove(tray);
    expect(workspace.activeWindow).toBeNull();
  });

  it('forgets every overlay window when it closes so a later call or a fullscreen app starts clean', () => {
    const { add, remove, announced } = boot();
    const pill = new FakeWindow(caption('pill bottom-centre 0,0 0 60'));
    add(pill);
    remove(pill);
    const video = new FakeWindow('Video');
    add(video);
    video.fullScreen = true;
    video.fullScreenChanged.emit();
    expect(CALLS(announced, 'Fullscreen')).toHaveLength(0);
    expect(video.fullScreenChanged.handlers).toHaveLength(1);
    remove(video);
    const again = new FakeWindow(caption('pill bottom-centre 0,0 0 60'));
    add(again);
    expect(again.captionChanged.handlers).toHaveLength(1);
    expect(again.frameGeometryChanged.handlers).toHaveLength(1);
  });

  it('leaves focus alone when an unfocused overlay window closes', () => {
    const { add, remove, workspace } = boot();
    const other = new FakeWindow('Browser');
    add(other);
    workspace.activeWindow = other;
    const pill = new FakeWindow(caption('pill bottom-centre 0,0 0 48'));
    add(pill);
    remove(pill);
    expect(workspace.activeWindow).toBe(other);
  });
});

function session(rig: BusRig, script = '/app/overlay-kwin.js'): SessionKwin {
  return new SessionKwin(
    () => Promise.resolve(script),
    () => rig.bus,
    5,
  );
}

const members = (rig: BusRig): string[] => rig.calls.map((call) => call.member);

describe('KWin session helper', () => {
  it('reloads the script by name, runs it and waits for it to announce itself', async () => {
    const rig = fakeBus({ running: true, ids: [7] });
    expect(await session(rig).load()).toBe('loaded');
    expect(members(rig)).toEqual([
      'AddMatch',
      'NameHasOwner',
      'unloadScript',
      'loadScript',
      'run',
      'isScriptLoaded',
    ]);
    const load = rig.calls.find((call) => call.member === 'loadScript');
    expect(load?.body).toEqual(['/app/overlay-kwin.js', KWIN_SCRIPT_NAME]);
    expect(rig.calls.find((call) => call.member === 'run')?.path).toBe('/Scripting/Script7');
    expect(rig.names).toEqual([READY_NAME]);
  });

  it('accepts an announcement that arrives after KWin answered the load check', async () => {
    const rig = fakeBus({ running: true, ids: [9], announceAfterReply: true });
    expect(await session(rig).load()).toBe('loaded');
    expect(rig.calls.filter((call) => call.member === 'run')).toHaveLength(1);
  });

  it('loads again under a new id when the first run never announced itself', async () => {
    const rig = fakeBus({ running: true, ids: [3, 4], announce: [false, true] });
    expect(await session(rig).load()).toBe('loaded');
    const runs = rig.calls.filter((call) => call.member === 'run').map((call) => call.path);
    expect(runs).toEqual(['/Scripting/Script3', '/Scripting/Script4']);
  });

  it('names a script that never announces itself after two runs', async () => {
    const rig = fakeBus({ running: true, ids: [3, 3], announce: [false, false] });
    const failure = session(rig).load();
    await expect(failure).rejects.toBeInstanceOf(KwinScriptSilentError);
    await expect(failure).rejects.toThrow('/app/overlay-kwin.js as 3 and 3');
  });

  it('reports a session without KWin as absent and changes nothing', async () => {
    const rig = fakeBus({ running: false, ids: [0] });
    expect(await session(rig, '/x.js').load()).toBe('absent');
    expect(members(rig)).toEqual(['AddMatch', 'NameHasOwner']);
  });

  it('names a script KWin refused', async () => {
    const rig = fakeBus({ running: true, ids: [-1] });
    await expect(session(rig, '/x.js').load()).rejects.toThrow('refused');
  });

  it('answers whether KWin still holds the script, and false before it ever loaded one', async () => {
    const rig = fakeBus({ running: true, ids: [1], loaded: false });
    const kwin = session(rig);
    expect(await kwin.loaded()).toBe(false);
    await kwin.load();
    expect(await kwin.loaded()).toBe(false);
    const held = session(fakeBus({ running: true, ids: [1] }));
    await held.load();
    expect(await held.loaded()).toBe(true);
  });

  it('tells its listeners when KWin comes back under a new owner and ignores other changes', async () => {
    const rig = fakeBus({ running: true, ids: [1] });
    const kwin = session(rig);
    let restarts = 0;
    kwin.onRestart(() => {
      restarts += 1;
    });
    await kwin.load();
    const change = (name: string, owner: string): Message =>
      new Message({
        type: MessageType.SIGNAL,
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'NameOwnerChanged',
        signature: 'sss',
        body: [name, '', owner],
      });
    rig.emit(change('org.kde.KWin', ''));
    rig.emit(change('org.other', ':1.9'));
    expect(restarts).toBe(0);
    rig.emit(change('org.kde.KWin', ':1.77'));
    expect(restarts).toBe(1);
    const match = rig.calls.find((call) => call.member === 'AddMatch');
    expect(match?.body[0]).toContain("member='NameOwnerChanged'");
  });

  it('unloads and disconnects once, and does nothing when never opened', async () => {
    const idle = fakeBus({ running: true, ids: [1] });
    await session(idle, '/x.js').unload();
    expect(idle.state().connected).toBe(false);
    const rig = fakeBus({ running: true, ids: [3] });
    const kwin = session(rig, '/x.js');
    await kwin.load();
    await kwin.unload();
    await kwin.unload();
    expect(rig.calls.filter((call) => call.member === 'unloadScript')).toHaveLength(2);
    expect(rig.state().disconnected).toBe(true);
  });
});
