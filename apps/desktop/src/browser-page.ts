import type { KeyboardInputEvent, MouseInputEvent, WebContents } from 'electron';
import {
  BrowserPageDriver,
  type BrowserPageHost,
  type BrowserPageOperation,
  type BrowserPageReading,
  type KeyModifier,
  type ParsedKeyCombo,
} from '@smarteverything/domain';

export const PAGE_WORLD_ID = 1_002;

export interface PageContents {
  readonly focus: () => void;
  readonly insertText: (text: string) => Promise<void>;
  readonly sendInputEvent: (event: MouseInputEvent | KeyboardInputEvent) => void;
  readonly executeJavaScriptInIsolatedWorld: WebContents['executeJavaScriptInIsolatedWorld'];
}

const MODIFIERS: Readonly<
  Record<KeyModifier, NonNullable<KeyboardInputEvent['modifiers']>[number]>
> = {
  ctrl: 'control',
  shift: 'shift',
  alt: 'alt',
  super: 'meta',
};

const ACCELERATORS: Readonly<Record<string, string>> = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ' ': 'Space',
};

const NON_TEXT_MODIFIERS: ReadonlySet<KeyModifier> = new Set(['ctrl', 'alt', 'super']);

function typesText(combo: ParsedKeyCombo): boolean {
  return (
    Array.from(combo.key).length === 1 &&
    !combo.modifiers.some((modifier) => NON_TEXT_MODIFIERS.has(modifier))
  );
}

function mouse(type: MouseInputEvent['type'], x: number, y: number): MouseInputEvent {
  return { type, x, y, button: 'left', clickCount: 1 };
}

export function electronPageHost(contents: PageContents): BrowserPageHost {
  return {
    evaluate: (code: string): Promise<unknown> =>
      contents.executeJavaScriptInIsolatedWorld(PAGE_WORLD_ID, [{ code }]),
    press: (combo: ParsedKeyCombo): Promise<void> => {
      contents.focus();
      const modifiers = combo.modifiers.map((modifier) => MODIFIERS[modifier]);
      const keyCode = ACCELERATORS[combo.key] ?? combo.key;
      contents.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
      if (typesText(combo))
        contents.sendInputEvent({ type: 'char', keyCode: combo.key, modifiers });
      contents.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
      return Promise.resolve();
    },
    trusted: {
      click: (x: number, y: number): Promise<void> => {
        contents.focus();
        contents.sendInputEvent({ type: 'mouseMove', x, y });
        contents.sendInputEvent(mouse('mouseDown', x, y));
        contents.sendInputEvent(mouse('mouseUp', x, y));
        return Promise.resolve();
      },
      insertText: (text: string): Promise<void> => contents.insertText(text),
    },
  };
}

export function electronPageDriver(contents: PageContents): BrowserPageDriver {
  return new BrowserPageDriver(electronPageHost(contents));
}

export async function performPageOperation(
  driver: BrowserPageDriver,
  operation: BrowserPageOperation,
): Promise<BrowserPageReading | null> {
  if (operation.kind === 'snapshot') return driver.read();
  await driver.perform(operation);
  return null;
}
