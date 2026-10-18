import { describe, expect, it, vi, type Mock } from 'vitest';
import type { OverlayAction } from '@smarteverything/domain';
import type { KwinEvent } from '../src/overlay/kwin-events.js';
import type { KwinPort } from '../src/overlay/kwin-overlay.js';
import { helperStatus } from '../src/overlay/overlay-helper.js';
import { OverlayController, type OverlayDeps } from '../src/overlay/overlay-controller.js';
import type { OverlayRole, OverlaySize } from '../src/overlay/overlay-messages.js';
import type {
  DisplayHints,
  DisplayInfo,
  FreePosition,
  Rect,
} from '../src/overlay/overlay-placement.js';
import type { OverlayWindow } from '../src/overlay/overlay-windows.js';
import { call, HIDDEN, host, input } from './support/overlay-views.js';

class FakeWindow implements OverlayWindow {
  visible = false;
  destroyed = false;
  focusable = false;
  clickThrough = false;
  bounds: Rect | null = null;
  size: OverlaySize | null = null;
  focusCalls = 0;
  sizeCalls = 0;
  readonly sent: { channel: string; payload: unknown }[] = [];
  readonly titles: string[] = [];
  readonly #closed: (() => void)[] = [];
  created: (() => void) | null = null;

  constructor(
    readonly role: OverlayRole,
    readonly senderId: number,
    readonly initial: OverlaySize,
    title: string,
  ) {
    this.titles.push(title);
  }

  show(): void {
    this.visible = true;
  }
  hide(): void {
    this.visible = false;
  }
  isVisible(): boolean {
    return this.visible;
  }
  setBounds(bounds: Rect): void {
    this.bounds = bounds;
  }
  setSize(size: OverlaySize): void {
    this.size = size;
    this.sizeCalls += 1;
  }
  setTitle(title: string): void {
    this.titles.push(title);
  }
  setFocusable(focusable: boolean): void {
    this.focusable = focusable;
  }
  setClickThrough(through: boolean): void {
    this.clickThrough = through;
  }
  focus(): void {
    this.focusCalls += 1;
  }
  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload });
  }
  destroy(): void {
    this.destroyed = true;
    this.#closed.forEach((listener) => {
      listener();
    });
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  onClosed(listener: () => void): void {
    this.#closed.push(listener);
    this.created?.();
  }
  get title(): string {
    return this.titles.at(-1) ?? '';
  }
}

const DISPLAY: DisplayInfo = {
  id: 1,
  origin: { x: 0, y: 0 },
  workArea: { x: 0, y: 0, width: 5120, height: 1400 },
  scale: 1,
  primary: true,
};

interface Rig {
  readonly controller: OverlayController;
  readonly windows: FakeWindow[];
  readonly delivered: OverlayAction[];
  readonly holds: boolean[];
  readonly helpers: string[];
  readonly load: Mock<KwinPort['load']>;
  readonly unload: Mock<KwinPort['unload']>;
  readonly loaded: Mock<KwinPort['loaded']>;
  readonly restart: () => void;
  readonly emit: (event: KwinEvent) => void;
  readonly saved: (FreePosition | null)[];
  readonly of: (role: OverlayRole) => FakeWindow | undefined;
  readonly setDisplays: (next: readonly DisplayInfo[]) => void;
}

function setup(
  overrides: Partial<OverlayDeps> = {},
  kwin: KwinPort | null = null,
  autoReady = true,
): Rig {
  const windows: FakeWindow[] = [];
  let displays: readonly DisplayInfo[] = [DISPLAY];
  const delivered: OverlayAction[] = [];
  const holds: boolean[] = [];
  const helpers: string[] = [];
  const load = vi.fn<KwinPort['load']>(() => Promise.resolve('loaded'));
  const unload = vi.fn<KwinPort['unload']>(() => Promise.resolve());
  const loaded = vi.fn<KwinPort['loaded']>(() => Promise.resolve(true));
  const restarts: (() => void)[] = [];
  const events: ((event: KwinEvent) => void)[] = [];
  const saved: (FreePosition | null)[] = [];
  const port: KwinPort | null = kwin ?? {
    load,
    unload,
    loaded,
    onRestart: (listener): void => {
      restarts.push(listener);
    },
    onEvent: (listener): void => {
      events.push(listener);
    },
  };
  const controller = new OverlayController({
    platform: 'linux',
    createWindow: (spec): FakeWindow => {
      const window = new FakeWindow(spec.role, windows.length + 100, spec.size, spec.title);
      windows.push(window);
      if (autoReady) {
        window.created = (): void => {
          controller.readyFrom(window.senderId);
        };
      }
      return window;
    },
    kwin: port,
    displays: (): readonly DisplayInfo[] => displays,
    hints: (): DisplayHints => ({ cursor: null, appWindow: null }),
    gpu: (): boolean => true,
    deliver: (action): void => {
      delivered.push(action);
    },
    hold: (active): void => {
      holds.push(active);
    },
    helperChanged: (helper): void => {
      helpers.push(helper.kind);
    },
    position: {
      load: (): FreePosition | null => saved.at(-1) ?? null,
      save: (position): void => {
        saved.push(position);
      },
    },
    positionChanged: (): void => undefined,
    ...overrides,
  });
  const of = (role: OverlayRole): FakeWindow | undefined =>
    windows.find((window) => window.role === role && !window.destroyed);
  return {
    controller,
    windows,
    delivered,
    holds,
    helpers,
    load,
    unload,
    loaded,
    restart: (): void => {
      restarts.forEach((listener) => {
        listener();
      });
    },
    emit: (event): void => {
      events.forEach((listener) => {
        listener(event);
      });
    },
    saved,
    of,
    setDisplays: (next: readonly DisplayInfo[]): void => {
      displays = next;
    },
  };
}

describe('overlay controller visibility', () => {
  it('creates nothing and loads nothing while the view is hidden', async () => {
    const { controller, windows, load } = setup();
    await controller.setView(HIDDEN);
    expect(windows).toHaveLength(0);
    expect(load).not.toHaveBeenCalled();
  });

  it('loads the KWin helper once and creates the pill, glow and tray for a live call', async () => {
    const { controller, windows, of, load, helpers } = setup();
    await controller.setView(host());
    await controller.setView(host(input({ call: call({ heard: 'more words' }) })));
    expect(load).toHaveBeenCalledTimes(1);
    expect(helpers).toEqual(['ready']);
    expect(windows.map((window) => window.role).sort()).toEqual(['glow', 'pill', 'tray']);
    expect(of('glow')?.initial).toEqual({ width: 5120, height: 140 });
    expect(of('pill')?.title).toBe('SmartEverything voice pill bottom-centre active 0 72');
    expect(of('glow')?.title).toBe('SmartEverything voice glow bottom-centre active 0 0');
    expect(of('pill')?.visible).toBe(true);
    expect(of('glow')?.visible).toBe(true);
    expect(of('tray')?.visible).toBe(false);
  });

  it('sends every window the latest view with the gpu decision', async () => {
    const { controller, of } = setup();
    const view = host();
    await controller.setView(view);
    const sent = of('pill')?.sent.at(-1);
    expect(sent?.channel).toBe('overlay:state');
    expect(sent?.payload).toEqual({ view, trayOpen: false, gpu: true });
  });
});

describe('overlay controller modes', () => {
  it('hides the glow in share mode and anchors the compact bar to the top', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    await controller.setView(
      host(input({ call: call({ sharing: { kind: 'screen', label: null } }) })),
    );
    expect(of('glow')?.visible).toBe(false);
    expect(of('pill')?.title).toBe('SmartEverything voice pill bottom-centre active 0 8');
    await controller.setView(
      host(input({ surface: { platform: 'desktop', main: 'other', inShare: false } })),
    );
    expect(of('pill')?.title).toBe('SmartEverything voice pill top-centre active 0 8');
    expect(of('glow')?.visible).toBe(false);
  });

  it('shows the glow again when the full bar returns', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    await controller.setView(
      host(input({ call: call({ sharing: { kind: 'window', label: 'Firefox' } }) })),
    );
    await controller.setView(host());
    expect(of('glow')?.visible).toBe(true);
  });

  it('draws no glow window when the glow preference is off', async () => {
    const { controller, windows } = setup();
    await controller.setView(host(input({ prefs: { ...input().prefs, glow: false } })));
    expect(windows.map((window) => window.role)).not.toContain('glow');
  });
});

describe('overlay controller sizing', () => {
  it('resizes the pill once the page reports its content and leaves position to KWin', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    const pill = of('pill');
    controller.sizeFrom(pill?.senderId ?? -1, { width: 520, height: 112 });
    expect(pill?.size).toEqual({ width: 520, height: 112 });
    expect(pill?.bounds).toBeNull();
  });

  it('leaves the glow size to the helper and never resizes a window twice for one size', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    const glow = of('glow');
    const pill = of('pill');
    expect(glow?.size).toBeNull();
    controller.sizeFrom(pill?.senderId ?? -1, { width: 520, height: 112 });
    const resizes = pill?.sizeCalls ?? 0;
    await controller.setView(host(input({ call: call({ heard: 'a few more words' }) })));
    expect(pill?.sizeCalls).toBe(resizes);
  });

  it('places by bounds when no KWin helper exists', async () => {
    const { controller, of } = setup({ kwin: null });
    await controller.setView(host());
    const pill = of('pill');
    controller.sizeFrom(pill?.senderId ?? -1, { width: 520, height: 112 });
    expect(pill?.bounds).toEqual({ x: 2300, y: 1400 - 112 - 72, width: 520, height: 112 });
    expect(of('glow')?.bounds).toEqual({ x: 0, y: 1400 - 140, width: 5120, height: 140 });
  });

  it('ignores a size from the glow or from an unknown window', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    controller.sizeFrom(of('glow')?.senderId ?? -1, { width: 10, height: 10 });
    controller.sizeFrom(9999, { width: 10, height: 10 });
    expect(of('glow')?.size).not.toEqual({ width: 10, height: 10 });
    expect(of('pill')?.size).not.toEqual({ width: 10, height: 10 });
  });
});

describe('overlay controller tray', () => {
  it('opens the tray with a focus flip and closes it back to non-focusable', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    const pill = of('pill');
    const tray = of('tray');
    controller.trayFrom(pill?.senderId ?? -1, true);
    expect(tray?.visible).toBe(true);
    expect(tray?.focusable).toBe(true);
    expect(tray?.title).toContain('tray bottom-centre active 1 146');
    expect(pill?.sent.at(-1)?.payload).toMatchObject({ trayOpen: true });
  });

  it('closes the tray back to a window that cannot take focus', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    controller.trayFrom(of('pill')?.senderId ?? -1, true);
    const tray = of('tray');
    controller.trayFrom(tray?.senderId ?? -1, false);
    expect(tray?.visible).toBe(false);
    expect(tray?.focusable).toBe(false);
    expect(tray?.title).toContain(' 0 146');
  });

  it('focuses the tray window directly when no KWin helper exists', async () => {
    const { controller, of } = setup({ kwin: null });
    await controller.setView(host());
    controller.trayFrom(of('pill')?.senderId ?? -1, true);
    expect(of('tray')?.focusCalls).toBe(1);
  });

  it('shows a request card without ever taking focus', async () => {
    const { controller, of } = setup();
    const request = call({
      request: { what: 'desktop_screen', why: 'To check the error', expiresAt: null },
    });
    await controller.setView(host(input({ call: request })));
    const tray = of('tray');
    expect(tray?.visible).toBe(true);
    controller.trayFrom(of('pill')?.senderId ?? -1, true);
    expect(tray?.focusable).toBe(false);
    expect(tray?.title).toContain(' 0 146');
  });

  it('gives the request card the keyboard on demand and hands it back when the card loses focus', async () => {
    const { controller, of } = setup();
    expect(controller.focusRequest()).toBe(false);
    const request = call({
      request: { what: 'desktop_screen', why: 'To check the error', expiresAt: null },
    });
    await controller.setView(host(input({ call: request })));
    expect(controller.hasRequest()).toBe(true);
    expect(controller.focusRequest()).toBe(true);
    const tray = of('tray');
    expect(tray?.focusable).toBe(true);
    expect(tray?.title).toContain(' 1 146');
    controller.trayFrom(tray?.senderId ?? -1, false);
    expect(tray?.focusable).toBe(false);
    expect(tray?.title).toContain(' 0 146');
  });

  it('takes the keyboard back from the card when the request goes away', async () => {
    const { controller, of } = setup();
    const request = call({
      request: { what: 'desktop_screen', why: 'To check the error', expiresAt: null },
    });
    await controller.setView(host(input({ call: request })));
    controller.focusRequest();
    await controller.setView(host());
    expect(controller.hasRequest()).toBe(false);
    expect(of('tray')?.focusable ?? false).toBe(false);
  });

  it('drops the tray window and its open state when the view has no tray', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    controller.trayFrom(of('pill')?.senderId ?? -1, true);
    await controller.setView(host(input({ call: call({ phase: 'ended', endedAt: 99_900 }) })));
    expect(of('tray')).toBeUndefined();
  });
});

describe('overlay controller retirement', () => {
  it('lets the pill animate out and destroys everything when it reports it left', async () => {
    const { controller, windows, of } = setup();
    await controller.setView(host());
    const pillId = of('pill')?.senderId ?? -1;
    await controller.setView(HIDDEN);
    expect(windows.every((window) => !window.destroyed)).toBe(true);
    expect(of('pill')?.sent.at(-1)?.payload).toMatchObject({ view: { state: 'hidden' } });
    controller.exitedFrom(pillId);
    expect(windows.every((window) => window.destroyed)).toBe(true);
  });

  it('keeps the windows when the pill leaves but a new view already came back', async () => {
    const { controller, windows, of } = setup();
    await controller.setView(host());
    const pillId = of('pill')?.senderId ?? -1;
    await controller.setView(HIDDEN);
    await controller.setView(host());
    controller.exitedFrom(pillId);
    expect(windows.some((window) => window.destroyed)).toBe(false);
  });

  it('closes at once when the pill never had a chance to show', async () => {
    const { controller, windows } = setup();
    await controller.setView(host());
    const first = windows.find((window) => window.role === 'pill');
    if (first === undefined) throw new Error('a pill expected');
    first.visible = false;
    const bare = setup();
    await bare.controller.setView(HIDDEN);
    expect(bare.windows).toHaveLength(0);
  });

  it('unloads the helper and destroys the windows on close', async () => {
    const { controller, windows, unload } = setup();
    await controller.setView(host());
    await controller.close();
    expect(windows.every((window) => window.destroyed)).toBe(true);
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('loads the helper again before showing windows after a close', async () => {
    const { controller, load } = setup();
    await controller.setView(host());
    await controller.close();
    await controller.setView(host());
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('overlay controller helper', () => {
  it('shows nothing when the helper fails and retries on the next show', async () => {
    const load = vi
      .fn<KwinPort['load']>()
      .mockRejectedValueOnce(new Error('KWin refused the script'))
      .mockResolvedValue('loaded');
    const kwin: KwinPort = {
      load,
      unload: () => Promise.resolve(),
      loaded: () => Promise.resolve(true),
      onRestart: () => undefined,
      onEvent: () => undefined,
    };
    const { controller, windows, helpers } = setup({}, kwin);
    await controller.setView(host());
    expect(windows).toHaveLength(0);
    expect(controller.helper()).toEqual({ kind: 'failed', reason: 'KWin refused the script' });
    await controller.setView(host());
    expect(windows.length).toBeGreaterThan(0);
    expect(helpers).toEqual(['failed', 'ready']);
  });

  it('needs no helper off Linux', async () => {
    const { controller, windows, helpers } = setup({ kwin: null });
    await controller.setView(host());
    expect(helpers).toEqual(['absent']);
    expect(windows.length).toBeGreaterThan(0);
  });
});

describe('overlay controller messages', () => {
  it('forwards levels only to a shown pill and glow', async () => {
    const { controller, of } = setup();
    controller.levels({ in: 0.5, out: 0, at: 1 });
    await controller.setView(host());
    controller.levels({ in: 0.5, out: 0, at: 2 });
    const levels = (role: OverlayRole): number =>
      of(role)?.sent.filter((message) => message.channel === 'overlay:levels').length ?? 0;
    expect(levels('pill')).toBe(1);
    expect(levels('glow')).toBe(1);
    expect(levels('tray')).toBe(0);
    await controller.setView(HIDDEN);
    controller.levels({ in: 0.5, out: 0, at: 3 });
    expect(levels('pill')).toBe(1);
  });

  it('relays actions and holds only from its own windows', async () => {
    const { controller, of, delivered, holds } = setup();
    await controller.setView(host());
    const pill = of('pill')?.senderId ?? -1;
    controller.actFrom(pill, { kind: 'mute' });
    controller.actFrom(4242, { kind: 'end' });
    controller.holdFrom(pill, true);
    controller.holdFrom(4242, true);
    expect(delivered).toEqual([{ kind: 'mute' }]);
    expect(holds).toEqual([true]);
  });
});

describe('overlay controller displays', () => {
  it('moves and resizes the glow when the work area changes and keeps the same window', async () => {
    const { controller, windows, of, setDisplays } = setup({ kwin: null });
    await controller.setView(host());
    controller.sizeFrom(of('pill')?.senderId ?? -1, { width: 520, height: 112 });
    setDisplays([{ ...DISPLAY, workArea: { x: 0, y: 0, width: 2560, height: 1400 } }]);
    controller.displaysChanged();
    expect(windows.filter((window) => window.role === 'glow')).toHaveLength(1);
    expect(of('glow')?.bounds).toEqual({ x: 0, y: 1400 - 140, width: 2560, height: 140 });
    expect(of('pill')?.bounds?.x).toBe(1020);
  });

  it('falls back to the primary display when the chosen one disappears', async () => {
    const second: DisplayInfo = { ...DISPLAY, id: 2, origin: { x: 5120, y: 0 }, primary: false };
    const { controller, of, setDisplays } = setup({
      kwin: null,
      displays: () => [DISPLAY, second],
      hints: () => ({ cursor: { x: 5200, y: 10 }, appWindow: null }),
    });
    await controller.setView(host());
    expect(of('glow')?.initial).toEqual({ width: 5120, height: 140 });
    setDisplays([DISPLAY]);
    controller.displaysChanged();
    expect(of('glow')).toBeDefined();
  });

  it('names a fixed display by its origin in every caption', async () => {
    const { controller, of } = setup({}, null);
    await controller.setView(host(input({ prefs: { ...input().prefs, display: 'primary' } })));
    expect(of('pill')?.title).toBe('SmartEverything voice pill bottom-centre 0,0 0 72');
  });
});

describe('overlay helper status', () => {
  it('names each helper state for the app and keeps the failure reason', () => {
    expect(helperStatus({ kind: 'idle' })).toEqual({ kind: 'unused' });
    expect(helperStatus({ kind: 'ready' })).toEqual({ kind: 'ready' });
    expect(helperStatus({ kind: 'absent' })).toEqual({ kind: 'absent' });
    expect(helperStatus({ kind: 'failed', reason: 'KWin refused' })).toEqual({
      kind: 'failed',
      reason: 'KWin refused',
    });
  });
});

describe('overlay controller page handshake', () => {
  it('holds back state and levels until the page says it is ready, then sends the latest view', async () => {
    const { controller, of } = setup({}, null, false);
    const view = host();
    await controller.setView(view);
    controller.levels({ in: 0.5, out: 0, at: 1 });
    expect(of('pill')?.sent).toEqual([]);
    controller.readyFrom(of('pill')?.senderId ?? -1);
    expect(of('pill')?.sent).toEqual([
      { channel: 'overlay:state', payload: { view, trayOpen: false, gpu: true } },
    ]);
    expect(of('glow')?.sent).toEqual([]);
    controller.levels({ in: 0.5, out: 0, at: 2 });
    expect(of('pill')?.sent.at(-1)?.channel).toBe('overlay:levels');
  });

  it('serves a page that becomes ready after a later view, with that later view', async () => {
    const { controller, of } = setup({}, null, false);
    await controller.setView(host());
    const later = host(input({ call: call({ heard: 'a newer sentence' }) }));
    await controller.setView(later);
    controller.readyFrom(of('glow')?.senderId ?? -1);
    expect(of('glow')?.sent.at(-1)?.payload).toMatchObject({ view: later });
  });

  it('ignores a ready message from a window it does not own', async () => {
    const { controller, of } = setup({}, null, false);
    await controller.setView(host());
    controller.readyFrom(4242);
    expect(of('pill')?.sent).toEqual([]);
  });
});

describe('overlay controller click-through', () => {
  it('lets clicks pass through the pill and tray the moment the view hides, before they are destroyed', async () => {
    const { controller, windows, of } = setup();
    await controller.setView(host());
    expect(of('pill')?.clickThrough).toBe(false);
    expect(of('glow')?.clickThrough).toBe(false);
    const pill = of('pill');
    await controller.setView(HIDDEN);
    expect(pill?.clickThrough).toBe(true);
    expect(windows.filter((window) => window.role !== 'glow').every((w) => w.clickThrough)).toBe(
      true,
    );
    controller.exitedFrom(pill?.senderId ?? -1);
    expect(windows.every((window) => window.destroyed)).toBe(true);
  });

  it('takes clicks again when the call comes back before the pill left', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    await controller.setView(HIDDEN);
    await controller.setView(host());
    expect(of('pill')?.clickThrough).toBe(false);
  });

  it('keeps a window that is not wanted click-through and hidden', async () => {
    const { controller, of } = setup();
    await controller.setView(host());
    expect(of('tray')?.visible).toBe(false);
    expect(of('tray')?.clickThrough).toBe(true);
  });
});

describe('overlay controller KWin restarts', () => {
  it('recreates the windows through a fresh helper when KWin restarts during a call', async () => {
    const { controller, windows, load, restart, helpers } = setup();
    await controller.setView(host());
    const before = windows.length;
    restart();
    await controller.setView(host(input({ call: call({ heard: 'still talking' }) })));
    expect(windows.slice(0, before).every((window) => window.destroyed)).toBe(true);
    expect(windows.length).toBeGreaterThan(before);
    expect(load).toHaveBeenCalledTimes(2);
    expect(helpers).toEqual(['ready', 'idle', 'ready']);
  });

  it('forgets the helper on a KWin restart while no call is shown and loads it for the next', async () => {
    const { controller, load, restart } = setup();
    await controller.setView(host());
    await controller.setView(HIDDEN);
    restart();
    await controller.setView(HIDDEN);
    expect(controller.helper()).toEqual({ kind: 'idle' });
    await controller.setView(host());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('loads the script again when KWin no longer holds it at the start of a call', async () => {
    const { controller, load, loaded, windows } = setup();
    await controller.setView(host());
    await controller.setView(HIDDEN);
    windows.forEach((window) => {
      window.destroy();
    });
    loaded.mockResolvedValueOnce(false);
    await controller.setView(host());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not ask KWin again while a call is already shown', async () => {
    const { controller, loaded } = setup();
    await controller.setView(host());
    await controller.setView(host(input({ call: call({ heard: 'x' }) })));
    expect(loaded).not.toHaveBeenCalled();
  });
});

describe('overlay controller fullscreen apps', () => {
  it('hides the glow and moves the full bar to the top while a fullscreen app runs, then returns', async () => {
    const { controller, emit, of } = setup();
    await controller.setView(host());
    expect(of('glow')?.visible).toBe(true);
    emit({ kind: 'fullscreen', active: true });
    await controller.setView(host());
    expect(of('glow')?.visible).toBe(false);
    expect(of('pill')?.title).toBe('SmartEverything voice pill top-centre active 0 12');
    emit({ kind: 'fullscreen', active: false });
    await controller.setView(host());
    expect(of('glow')?.visible).toBe(true);
    expect(of('pill')?.title).toBe('SmartEverything voice pill bottom-centre active 0 72');
  });

  it('puts the open tray below a top bar', async () => {
    const { controller, emit, of } = setup();
    await controller.setView(host());
    emit({ kind: 'fullscreen', active: true });
    await controller.setView(host());
    expect(of('tray')?.title).toBe('SmartEverything voice tray top-centre active 0 86');
  });

  it('forgets the fullscreen state when the windows are gone', async () => {
    const { controller, emit, of } = setup();
    await controller.setView(host());
    emit({ kind: 'fullscreen', active: true });
    await controller.setView(HIDDEN);
    controller.exitedFrom(of('pill')?.senderId ?? -1);
    await controller.setView(host());
    expect(of('pill')?.title).toBe('SmartEverything voice pill bottom-centre active 0 72');
  });
});

describe('overlay controller dragged bar', () => {
  it('keeps the bar where the user dropped it, saves it, and keeps it there through fullscreen', async () => {
    const { controller, emit, of, saved } = setup();
    await controller.setView(host());
    emit({ kind: 'moved', free: { cx: 0.25, cy: 0.5 } });
    expect(saved.at(-1)).toEqual({ cx: 0.25, cy: 0.5 });
    expect(of('pill')?.title).toBe('SmartEverything voice pill free@0.2500,0.5000 active 0 72');
    expect(of('tray')?.title).toContain('free@0.2500,0.5000');
    expect(of('glow')?.title).toBe('SmartEverything voice glow bottom-centre active 0 0');
    emit({ kind: 'fullscreen', active: true });
    await controller.setView(host());
    expect(of('pill')?.title).toContain('free@0.2500,0.5000');
    expect(of('glow')?.visible).toBe(false);
  });

  it('starts at the remembered position and goes back on reset', async () => {
    const rig = setup({
      position: {
        load: () => ({ cx: 0.8, cy: 0.1 }),
        save: (position) => rig.saved.push(position),
      },
    });
    await rig.controller.setView(host());
    expect(rig.of('pill')?.title).toContain('free@0.8000,0.1000');
    expect(rig.controller.moved).toBe(true);
    rig.controller.resetPosition();
    expect(rig.saved.at(-1)).toBeNull();
    expect(rig.controller.moved).toBe(false);
    expect(rig.of('pill')?.title).toBe('SmartEverything voice pill bottom-centre active 0 72');
  });
});
