import type { OverlayHostView } from '@smarteverything/domain/voice-overlay';

const FULL_MIN_WIDTH = 320;
const FULL_MAX_WIDTH = 640;
const BAR_MIN_WIDTH = 300;
const BAR_MAX_WIDTH = 520;
const TEXT_MIN_WIDTH = 140;
export const DOT_WIDTH = 12;
const ROUNDING_ALLOWANCE = 2;
export const FULL_PILL_HEIGHT = 64;
export const BAR_PILL_HEIGHT = 44;
const TRAY_WIDTH = 420;

export interface WidthInputs {
  readonly mode: OverlayHostView['mode'];
  readonly fixed: number;
  readonly statusWidth: number;
  readonly captionWidth: number;
}

export interface WidthResult {
  readonly width: number;
  readonly column: number;
  readonly clipStatus: boolean;
  readonly overCaption: boolean;
}

export function pillWidth(inputs: WidthInputs): WidthResult {
  const bar = inputs.mode !== 'full';
  const need = bar
    ? inputs.statusWidth + ROUNDING_ALLOWANCE
    : Math.max(inputs.statusWidth, inputs.captionWidth, TEXT_MIN_WIDTH);
  const min = bar ? BAR_MIN_WIDTH : FULL_MIN_WIDTH;
  const max = bar ? BAR_MAX_WIDTH : FULL_MAX_WIDTH;
  const fixed = inputs.fixed + (bar ? 0 : ROUNDING_ALLOWANCE);
  const width = Math.round(Math.min(max, Math.max(min, fixed + need)));
  const column = width - fixed;
  return {
    width,
    column,
    clipStatus: inputs.statusWidth > column,
    overCaption: !bar && inputs.captionWidth > column,
  };
}

export interface ChipFit {
  readonly result: WidthResult;
  readonly iconOnly: boolean;
}

export function fitChip(layout: (iconOnly: boolean) => WidthResult): ChipFit {
  const labelled = layout(false);
  return labelled.clipStatus
    ? { result: layout(true), iconOnly: true }
    : { result: labelled, iconOnly: false };
}

export interface WindowSize {
  readonly width: number;
  readonly height: number;
}

export function pillWindowSize(width: number, mode: OverlayHostView['mode']): WindowSize {
  return { width, height: mode === 'full' ? FULL_PILL_HEIGHT : BAR_PILL_HEIGHT };
}

export function trayWindowSize(contentHeight: number): WindowSize {
  return { width: TRAY_WIDTH, height: Math.ceil(contentHeight) };
}

export class SizeReporter {
  #sent: WindowSize | null = null;
  #pending: WindowSize | null = null;

  constructor(private readonly report: (size: WindowSize) => void) {}

  want(size: WindowSize, animated: boolean): void {
    const sent = this.#sent;
    if (sent === null || !animated) {
      this.#pending = null;
      this.#send(size);
      return;
    }
    if (size.width >= sent.width && size.height >= sent.height) {
      this.#pending = null;
      this.#send(size);
      return;
    }
    const grown = {
      width: Math.max(sent.width, size.width),
      height: Math.max(sent.height, size.height),
    };
    this.#send(grown);
    this.#pending = grown.width === size.width && grown.height === size.height ? null : size;
  }

  settled(): void {
    const pending = this.#pending;
    this.#pending = null;
    if (pending !== null) {
      this.#send(pending);
    }
  }

  reset(): void {
    this.#sent = null;
    this.#pending = null;
  }

  #send(size: WindowSize): void {
    const sent = this.#sent;
    if (sent !== null && sent.width === size.width && sent.height === size.height) {
      return;
    }
    this.#sent = size;
    this.report(size);
  }
}
