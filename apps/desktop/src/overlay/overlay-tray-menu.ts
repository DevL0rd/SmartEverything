import { OVERLAY_LABELS, type OverlayAction, type OverlayHostView } from '@smarteverything/domain';
import type { MenuItemConstructorOptions } from 'electron';

const NOT_NOW = 'Not now';
const RESET_POSITION = 'Move the call bar back';

export interface MenuEntry {
  readonly label: string;
  readonly checked: boolean | null;
  readonly action: OverlayAction | null;
}

function entry(label: string, action: OverlayAction, checked: boolean | null = null): MenuEntry {
  return { label, checked, action };
}

function visible(view: OverlayHostView | null): view is OverlayHostView {
  return view !== null && view.state !== 'hidden' && view.prefs.enabled;
}

function requestEntries(view: OverlayHostView): MenuEntry[] {
  if (view.request === null) {
    return [];
  }
  return [
    entry(view.request.accept, { kind: 'accept_request' }),
    entry(NOT_NOW, { kind: 'decline_request' }),
  ];
}

function controlEntries(view: OverlayHostView): MenuEntry[] {
  const has = (control: OverlayHostView['controls'][number]): boolean =>
    view.controls.includes(control);
  return [
    ...(has('mute') ? [entry(OVERLAY_LABELS.mute, { kind: 'mute' }, view.muted)] : []),
    ...(has('interrupt') ? [entry(OVERLAY_LABELS.interrupt, { kind: 'interrupt' })] : []),
    ...(has('stop_share') ? [entry(OVERLAY_LABELS.stop_share, { kind: 'stop_share' })] : []),
    ...(has('retry') ? [entry(OVERLAY_LABELS.retry, { kind: 'retry' })] : []),
    ...(has('fix') ? [entry(OVERLAY_LABELS.fix, { kind: 'fix' })] : []),
    ...(has('end') ? [entry(OVERLAY_LABELS.end, { kind: 'end' })] : []),
  ];
}

export function overlayMenuEntries(view: OverlayHostView | null): MenuEntry[] {
  return visible(view) ? [...requestEntries(view), ...controlEntries(view)] : [];
}

function itemOf(
  menuEntry: MenuEntry,
  act: (action: OverlayAction) => void,
): MenuItemConstructorOptions {
  const { action, checked, label } = menuEntry;
  const click = (): void => {
    if (action !== null) {
      act(action);
    }
  };
  return checked === null ? { label, click } : { label, type: 'checkbox', checked, click };
}

export function overlayMenuItems(
  view: OverlayHostView | null,
  act: (action: OverlayAction) => void,
  resetPosition: (() => void) | null = null,
): MenuItemConstructorOptions[] {
  if (!visible(view)) {
    return [];
  }
  return [
    { label: `AI: ${view.status}`, enabled: false },
    ...overlayMenuEntries(view).map((menuEntry) => itemOf(menuEntry, act)),
    ...(resetPosition === null ? [] : [{ label: RESET_POSITION, click: resetPosition }]),
    { type: 'separator' },
  ];
}

export function overlayMenuSignature(view: OverlayHostView | null): string {
  if (!visible(view)) {
    return '';
  }
  return JSON.stringify([view.status, view.muted, view.controls, view.request?.accept ?? null]);
}
