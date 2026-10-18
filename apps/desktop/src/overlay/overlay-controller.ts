import type { OverlayAction, OverlayHostView } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { KwinEvent } from './kwin-events.js';
import type { KwinPort } from './kwin-overlay.js';
import type { PositionPort } from './overlay-position.js';
import { HelperGate, type OverlayHelper } from './overlay-helper.js';
import {
  OVERLAY_CHANNELS,
  type OverlayLevels,
  type OverlayPageState,
  type OverlayRole,
  type OverlaySize,
} from './overlay-messages.js';
import {
  FIRST_PILL_SIZE,
  FIRST_TRAY_SIZE,
  anchorFor,
  anchorOf,
  boundsOf,
  captionOf,
  chooseDisplay,
  freeToken,
  outputToken,
  verticalOf,
  type FreePosition,
  glowSize,
  insetOf,
  type DisplayHints,
  type Anchor,
  type DisplayInfo,
  type Rect,
} from './overlay-placement.js';
import { Slot } from './overlay-slot.js';
import type { OverlayWindowFactory } from './overlay-windows.js';

const log = new Logger('desktop.overlay');

export interface OverlayDeps {
  readonly platform: NodeJS.Platform;
  readonly createWindow: OverlayWindowFactory;
  readonly kwin: KwinPort | null;
  readonly displays: () => readonly DisplayInfo[];
  readonly hints: () => DisplayHints;
  readonly gpu: () => boolean;
  readonly deliver: (action: OverlayAction) => void;
  readonly hold: (active: boolean) => void;
  readonly helperChanged: (helper: OverlayHelper) => void;
  readonly position: PositionPort;
  readonly positionChanged: () => void;
}

function visibleView(view: OverlayHostView): boolean {
  return view.state !== 'hidden' && view.prefs.enabled;
}

export class OverlayController {
  readonly #slots = new Map<OverlayRole, Slot>();
  #view: OverlayHostView | null = null;
  #trayOpen = false;
  #cardFocus = false;
  #display: DisplayInfo | null = null;
  #active = false;
  readonly #helper: HelperGate;
  #queue: Promise<void> = Promise.resolve();
  #gpu: boolean | null = null;
  #free: FreePosition | null;
  #fullscreen = false;

  constructor(private readonly deps: OverlayDeps) {
    this.#helper = new HelperGate(deps.kwin, deps.helperChanged);
    this.#free = deps.position.load();
    deps.kwin?.onRestart(() => {
      this.#kwinRestarted();
    });
    deps.kwin?.onEvent((event) => {
      this.#kwinEvent(event);
    });
  }

  get moved(): boolean {
    return this.#free !== null;
  }

  resetPosition(): void {
    this.#setFree(null);
  }

  helper(): OverlayHelper {
    return this.#helper.state;
  }

  setView(view: OverlayHostView): Promise<void> {
    this.#queue = this.#queue
      .then(() => this.#apply(view))
      .catch((cause: unknown) => {
        log.error('overlay.apply_failed', cause);
      });
    return this.#queue;
  }

  levels(levels: OverlayLevels): void {
    if (!this.#active) {
      return;
    }
    for (const role of ['pill', 'glow'] as const) {
      const slot = this.#slots.get(role);
      if (slot?.shown === true && slot.loaded) {
        slot.window.send(OVERLAY_CHANNELS.levels, levels);
      }
    }
  }

  sizeFrom(senderId: number, size: OverlaySize): void {
    const slot = this.#slotOf(senderId);
    if (slot !== undefined && slot.role !== 'glow' && slot.resize(size)) {
      this.#place();
    }
  }

  hasRequest(): boolean {
    const view = this.#view;
    return this.#active && view !== null && view.request !== null;
  }

  focusRequest(): boolean {
    if (!this.hasRequest()) {
      return false;
    }
    if (!this.#cardFocus) {
      this.#cardFocus = true;
      this.#place();
    }
    return true;
  }

  trayFrom(senderId: number, open: boolean): void {
    const view = this.#view;
    if (this.#slotOf(senderId) === undefined || view === null || !this.#active) {
      return;
    }
    if (!open && this.#cardFocus) {
      this.#cardFocus = false;
      this.#place();
    }
    const next = open && view.tray !== null;
    if (next === this.#trayOpen) {
      return;
    }
    this.#trayOpen = next;
    this.#publish();
    this.#place();
  }

  holdFrom(senderId: number, active: boolean): void {
    if (this.#slotOf(senderId) !== undefined) {
      this.deps.hold(active);
    }
  }

  actFrom(senderId: number, action: OverlayAction): void {
    if (this.#slotOf(senderId) !== undefined) {
      this.deps.deliver(action);
    }
  }

  readyFrom(senderId: number): void {
    const slot = this.#slotOf(senderId);
    if (slot === undefined) {
      return;
    }
    slot.loaded = true;
    const state = this.#state();
    if (state !== null) {
      slot.window.send(OVERLAY_CHANNELS.state, state);
    }
  }

  exitedFrom(senderId: number): void {
    if (this.#slotOf(senderId)?.role === 'pill' && !this.#active) {
      this.#retire();
    }
  }

  displaysChanged(): void {
    const view = this.#view;
    const current = this.#display;
    if (!this.#active || view === null || current === null) {
      return;
    }
    const all = this.deps.displays();
    const picked =
      all.find((display) => display.id === current.id) ??
      chooseDisplay('primary', all, this.deps.hints());
    if (picked === null) {
      return;
    }
    this.#display = picked;
    this.#ensure(view);
    this.#place();
  }

  async close(): Promise<void> {
    await this.#queue;
    this.#retire();
    await this.#helper.close();
  }

  #setFree(free: FreePosition | null): void {
    this.#free = free;
    this.deps.position.save(free);
    this.deps.positionChanged();
    this.#place();
  }

  #kwinEvent(event: KwinEvent): void {
    if (event.kind === 'moved') {
      this.#setFree(event.free);
    } else if (event.kind === 'fullscreen' && event.active !== this.#fullscreen) {
      this.#queue = this.#queue.then(() => {
        this.#fullscreen = event.active;
        this.#place();
      });
    }
  }

  #kwinRestarted(): void {
    this.#queue = this.#queue
      .then(async () => {
        this.#helper.lost();
        const view = this.#view;
        if (this.#active && view !== null) {
          this.#retire();
          await this.#apply(view);
        }
      })
      .catch((cause: unknown) => {
        log.error('overlay.restart_failed', cause);
      });
  }

  async #apply(view: OverlayHostView): Promise<void> {
    this.#view = view;
    if (!visibleView(view)) {
      this.#conceal();
      return;
    }
    if (!(await this.#helper.prepare(!this.#active))) {
      return;
    }
    if (!this.#active) {
      this.#display = chooseDisplay(view.prefs.display, this.deps.displays(), this.deps.hints());
    }
    this.#active = true;
    this.#ensure(view);
    this.#publish();
    this.#place();
  }

  #ensure(view: OverlayHostView): void {
    this.#gpu ??= this.deps.gpu();
    this.#need('pill', FIRST_PILL_SIZE);
    const wantGlow = view.mode === 'full' && view.prefs.glow && this.#display !== null;
    if (wantGlow && this.#display !== null) {
      this.#need('glow', glowSize(this.#display.workArea));
    }
    if (view.tray === null && view.request === null) {
      this.#trayOpen = false;
      this.#drop('tray');
    } else {
      this.#need('tray', FIRST_TRAY_SIZE);
    }
  }

  #need(role: OverlayRole, size: OverlaySize): Slot {
    const existing = this.#slots.get(role);
    if (existing !== undefined) {
      return existing;
    }
    const title = this.#title(role, false);
    const window = this.deps.createWindow({ role, size, title, platform: this.deps.platform });
    const slot = new Slot(window, size, title);
    this.#slots.set(role, slot);
    window.onClosed(() => {
      if (this.#slots.get(role)?.window === window) {
        this.#slots.delete(role);
      }
    });
    return slot;
  }

  #drop(role: OverlayRole): void {
    const slot = this.#slots.get(role);
    if (slot !== undefined) {
      this.#slots.delete(role);
      slot.window.destroy();
    }
  }

  #title(role: OverlayRole, focus: boolean): string {
    const view = this.#view;
    const mode = view?.mode ?? 'full';
    const display = view?.prefs.display ?? 'active';
    const anchor = this.#anchorOf(role, mode, view?.prefs.position ?? 'centre');
    return captionOf({
      role,
      anchor: this.#free !== null && role !== 'glow' ? freeToken(this.#free) : anchor,
      output: outputToken(this.#display === null ? 'active' : display, this.#display),
      focus,
      inset: insetOf(role, mode, verticalOf(anchor)),
    });
  }

  #anchorOf(
    role: OverlayRole,
    mode: OverlayHostView['mode'],
    position: OverlayHostView['prefs']['position'],
  ): Anchor {
    return anchorFor(role, anchorOf(mode, position, this.#fullscreen));
  }

  #state(): OverlayPageState | null {
    const view = this.#view;
    return view === null ? null : { view, trayOpen: this.#trayOpen, gpu: this.#gpu ?? false };
  }

  #publish(): void {
    const state = this.#state();
    if (state === null) {
      return;
    }
    this.#slots.forEach((slot) => {
      if (slot.loaded) {
        slot.window.send(OVERLAY_CHANNELS.state, state);
      }
    });
  }

  #conceal(): void {
    this.#trayOpen = false;
    this.#cardFocus = false;
    const wasActive = this.#active;
    this.#active = false;
    if (this.#slots.size === 0) {
      return;
    }
    const pill = this.#slots.get('pill');
    if (!wasActive || pill?.shown !== true) {
      this.#retire();
      return;
    }
    this.#slots.forEach((slot) => {
      slot.passClicks(true);
    });
    this.#publish();
  }

  #retire(): void {
    this.#slots.forEach((slot) => {
      slot.window.destroy();
    });
    this.#slots.clear();
    this.#trayOpen = false;
    this.#cardFocus = false;
    this.#fullscreen = false;
  }

  #slotOf(senderId: number): Slot | undefined {
    return [...this.#slots.values()].find((slot) => slot.window.senderId === senderId);
  }

  #place(): void {
    const view = this.#view;
    const area = this.#display?.workArea;
    if (view === null || area === undefined || !this.#active) {
      return;
    }
    const wantsFocus = view.request === null ? this.#trayOpen : this.#cardFocus;
    this.#slots.forEach((slot) => {
      this.#placeSlot(slot, view, area, wantsFocus);
    });
  }

  #placeSlot(slot: Slot, view: OverlayHostView, area: Rect, wantsFocus: boolean): void {
    const { role } = slot;
    const focus = role === 'tray' && wantsFocus;
    const anchor = this.#anchorOf(role, view.mode, view.prefs.position);
    const size = role === 'glow' ? glowSize(area) : slot.size;
    const inset = insetOf(role, view.mode, verticalOf(anchor));
    slot.fit(this.#helper.ready, boundsOf(anchor, size, area, inset));
    const wanted = this.#wanted(role, view);
    slot.passClicks(!wanted);
    if (wanted) {
      slot.show(true);
    }
    this.#focusable(slot, focus);
    slot.retitle(this.#title(role, focus));
    if (!wanted) {
      slot.show(false);
    }
  }

  #focusable(slot: Slot, focus: boolean): void {
    if (slot.setFocus(focus) && focus && !this.#helper.ready) {
      slot.window.focus();
    }
  }

  #wanted(role: OverlayRole, view: OverlayHostView): boolean {
    if (role === 'glow') {
      return view.mode === 'full' && view.prefs.glow && !this.#fullscreen;
    }
    if (role === 'pill') {
      return true;
    }
    return view.request !== null || (this.#trayOpen && view.tray !== null);
  }
}
