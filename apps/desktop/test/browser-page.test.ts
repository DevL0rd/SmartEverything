import type { KeyboardInputEvent, MouseInputEvent } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  BROWSER_PAGE_SCRIPT,
  parseKeyCombo,
  type BrowserPageReading,
} from '@smarteverything/domain';
import {
  PAGE_WORLD_ID,
  electronPageDriver,
  electronPageHost,
  performPageOperation,
  type PageContents,
} from '../src/browser-page.js';

interface Harness {
  readonly contents: PageContents;
  readonly events: (MouseInputEvent | KeyboardInputEvent)[];
  readonly inserted: string[];
  readonly codes: string[];
  readonly focused: number[];
}

const READING: BrowserPageReading = {
  generation: 1,
  end: 2,
  title: 'Page',
  text: 'Hello',
  textTruncated: false,
  elements: [
    { ref: 'e1', role: 'button', name: 'Go', value: null, checked: null, disabled: false },
  ],
  elementsTruncated: false,
};

function harness(answer: unknown): Harness {
  const events: Harness['events'] = [];
  const inserted: string[] = [];
  const codes: string[] = [];
  const focused: number[] = [];
  const contents: PageContents = {
    focus: (): void => {
      focused.push(events.length);
    },
    insertText: (text): Promise<void> => {
      inserted.push(text);
      return Promise.resolve();
    },
    sendInputEvent: (event): void => {
      events.push(event);
    },
    executeJavaScriptInIsolatedWorld: (world, scripts): Promise<unknown> => {
      expect(world).toBe(PAGE_WORLD_ID);
      codes.push(scripts[0]?.code ?? '');
      return Promise.resolve(answer);
    },
  };
  return { contents, events, inserted, codes, focused };
}

describe('the desktop page host', () => {
  it('runs the page script in an isolated world', async () => {
    const { contents, codes } = harness({ ok: true, x: 3, y: 4 });
    await electronPageHost(contents).evaluate('1+1');
    expect(codes).toEqual(['1+1']);
  });

  it('clicks with a real pointer press and release at the given point', async () => {
    const { contents, events, focused } = harness({ ok: true });
    await electronPageHost(contents).trusted?.click(30, 40);
    expect(events.map((event) => event.type)).toEqual(['mouseMove', 'mouseDown', 'mouseUp']);
    expect(events[1]).toMatchObject({ x: 30, y: 40, button: 'left', clickCount: 1 });
    expect(focused).toEqual([0]);
  });

  it('inserts text into the focused field', async () => {
    const { contents, inserted } = harness({ ok: true });
    await electronPageHost(contents).trusted?.insertText('a£b');
    expect(inserted).toEqual(['a£b']);
  });

  it('presses a named key with modifiers and no text event', async () => {
    const { contents, events } = harness({ ok: true });
    await electronPageHost(contents).press(parseKeyCombo('ctrl+shift+Left'));
    expect(events).toEqual([
      { type: 'keyDown', keyCode: 'Left', modifiers: ['control', 'shift'] },
      { type: 'keyUp', keyCode: 'Left', modifiers: ['control', 'shift'] },
    ]);
  });

  it('presses a character with a text event, and maps space and super', async () => {
    const { contents, events } = harness({ ok: true });
    const host = electronPageHost(contents);
    await host.press(parseKeyCombo('a'));
    await host.press(parseKeyCombo('super+space'));
    expect(events.map((event) => [event.type, 'keyCode' in event ? event.keyCode : ''])).toEqual([
      ['keyDown', 'a'],
      ['char', 'a'],
      ['keyUp', 'a'],
      ['keyDown', 'Space'],
      ['keyUp', 'Space'],
    ]);
    expect(events[3]).toMatchObject({ modifiers: ['meta'] });
  });
});

describe('page operations from the app', () => {
  it('reads the page through the script and returns the reading', async () => {
    const { contents, codes } = harness({ ok: true, reading: READING });
    const reading = await performPageOperation(electronPageDriver(contents), { kind: 'snapshot' });
    expect(reading).toEqual(READING);
    expect(codes[0]).toContain(BROWSER_PAGE_SCRIPT);
  });

  it('acts on the page and returns nothing', async () => {
    const { contents, events } = harness({ ok: true, x: 5, y: 6 });
    const driver = electronPageDriver(contents);
    expect(await performPageOperation(driver, { kind: 'click', ref: 'e1' })).toBeNull();
    expect(events.map((event) => event.type)).toEqual(['mouseMove', 'mouseDown', 'mouseUp']);
  });

  it('passes on a refusal from the page', async () => {
    const { contents } = harness({ ok: false, error: 'The ref e9 belongs to an earlier reading.' });
    await expect(
      performPageOperation(electronPageDriver(contents), { kind: 'click', ref: 'e9' }),
    ).rejects.toThrow('earlier reading');
  });
});
