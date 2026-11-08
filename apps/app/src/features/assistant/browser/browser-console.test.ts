import {
  BROWSER_CONSOLE_EVENT,
  BROWSER_TARGET,
  type BrowserConsoleMessage,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { browserConsole, BrowserConsoleStore } from './browser-console-store';
import { BrowserRepair, repairPrompt } from './browser-repair';
import {
  closeBrowserSurface,
  recordBrowserSurfaceConsole,
  retainBrowserSurface,
} from './browser-surfaces';

function entry(
  level: BrowserConsoleMessage['level'],
  message: string,
  id = 'preview',
): BrowserConsoleMessage {
  return {
    kind: 'message',
    id,
    level,
    message,
    source: 'https://fixture.test/page.js?key=raw',
    line: 8,
  };
}

describe('the built-in browser console', () => {
  it('retains raw messages in order and scopes them to their page', () => {
    const store = new BrowserConsoleStore();
    const raw = '  undefined\nError: <raw output>\t= secret-value  ';
    const warning = entry('warning', 'Unchanged warning');
    const error = entry('error', raw);
    store.record(BROWSER_CONSOLE_EVENT.parse(warning));
    store.record(BROWSER_CONSOLE_EVENT.parse(error));
    store.record(entry('log', 'Other tab', 'other'));
    expect(store.read('preview').rows.map((row) => row.message)).toEqual([warning.message, raw]);
    expect(store.read('other').rows.map((row) => row.message)).toEqual(['Other tab']);
    const prompt = repairPrompt(error, store.read('preview').rows);
    expect(prompt).toContain(warning.message);
    expect(prompt).toContain(raw);
    expect(prompt).toContain(error.source);
    expect(prompt.split(raw)).toHaveLength(2);
  });

  it('keeps warnings from waking the AI and deduplicates errors until navigation', () => {
    const store = new BrowserConsoleStore();
    const error = entry('error', 'Repeated');
    expect(store.claim(entry('warning', error.message))).toBe(false);
    expect(store.claim(error)).toBe(true);
    store.clear(error.id);
    expect(store.claim(error)).toBe(false);
    store.record({ kind: 'navigation', id: error.id });
    expect(store.claim(error)).toBe(true);
  });

  it('bounds a noisy page without rewriting the retained output', () => {
    const store = new BrowserConsoleStore();
    const row = entry('log', 'a'.repeat(80_000));
    store.record(row);
    store.record(row);
    expect(store.read(row.id).rows.map((message) => message.message)).toEqual([row.message]);
    expect(store.read(row.id).dropped).toBe(1);
    store.forget(row.id);
    expect(store.read(row.id).rows).toEqual([]);
  });

  it('keeps raw logs on route detachment and discards late events from a closed preview', () => {
    const event = entry('error', 'raw retained output');
    const target = BROWSER_TARGET.parse({
      kind: 'public',
      id: event.id,
      url: 'https://fixture.example',
    });
    const detach = retainBrowserSurface(
      'chat',
      {
        target,
        ref: null,
        visible: true,
        onStatus: () => undefined,
      },
      Symbol('slot'),
    );
    try {
      recordBrowserSurfaceConsole(event);
      detach();
      expect(browserConsole.read(event.id).rows).toHaveLength(1);
      closeBrowserSurface(event.id);
      recordBrowserSurfaceConsole(event);
      expect(browserConsole.read(event.id).rows).toEqual([]);
    } finally {
      closeBrowserSurface(event.id);
    }
  });

  it('holds the repair gate through reload, queued and working states until its own turn settles', () => {
    const repair = new BrowserRepair();
    expect(repair.idle()).toBe(true);
    repair.start('repair');
    repair.observe([{ client_message_id: 'other', state: 'answered' }]);
    repair.observe([{ client_message_id: 'repair', state: 'queued' }]);
    repair.observe([{ client_message_id: 'repair', state: 'working' }]);
    expect(repair.idle()).toBe(false);
    repair.observe([{ client_message_id: 'repair', state: 'answered' }]);
    expect(repair.idle()).toBe(true);
  });
});
