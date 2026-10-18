import type { OverlayRole, OverlaySize } from './overlay-messages.js';
import type { Rect } from './overlay-placement.js';
import type { OverlayWindow } from './overlay-windows.js';

export class Slot {
  size: OverlaySize;
  title: string;
  focusable = false;
  shown = false;
  loaded = false;
  #through: boolean;
  #applied = '';

  constructor(
    readonly window: OverlayWindow,
    size: OverlaySize,
    title: string,
  ) {
    this.size = size;
    this.title = title;
    this.#through = window.role === 'glow';
  }

  get role(): OverlayRole {
    return this.window.role;
  }

  resize(size: OverlaySize): boolean {
    if (this.size.width === size.width && this.size.height === size.height) {
      return false;
    }
    this.size = size;
    return true;
  }

  retitle(title: string): void {
    if (title !== this.title) {
      this.title = title;
      this.window.setTitle(title);
    }
  }

  fit(helperReady: boolean, bounds: Rect): void {
    const target = helperReady ? (this.role === 'glow' ? null : this.size) : bounds;
    const key = JSON.stringify(target);
    if (target === null || key === this.#applied) {
      return;
    }
    this.#applied = key;
    if (helperReady) {
      this.window.setSize(this.size);
    } else {
      this.window.setBounds(bounds);
    }
  }

  setFocus(focus: boolean): boolean {
    if (this.focusable === focus) {
      return false;
    }
    this.focusable = focus;
    this.window.setFocusable(focus);
    return true;
  }

  passClicks(through: boolean): void {
    if (this.role === 'glow' || this.#through === through) {
      return;
    }
    this.#through = through;
    this.window.setClickThrough(through);
  }

  show(wanted: boolean): void {
    if (wanted && !this.shown) {
      this.shown = true;
      this.window.show();
    } else if (!wanted && this.shown) {
      this.shown = false;
      this.window.hide();
    }
  }
}
