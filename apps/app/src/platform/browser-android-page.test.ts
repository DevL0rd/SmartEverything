import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_PAGE_SCRIPT, type NativeBrowserPage } from '@smarteverything/domain';

const fake = vi.hoisted(
  (): {
    ready: boolean;
    evaluated: { id: string; code: string }[];
    pressed: { id: string; json: string }[];
    answer: string;
    withPage: boolean;
  } => ({ ready: true, evaluated: [], pressed: [], answer: 'null', withPage: true }),
);

vi.mock('expo', () => ({
  NativeModule: Object,
  requireOptionalNativeModule: (): Record<string, unknown> => ({
    browserProfileReady: (): boolean => fake.ready,
    ...(fake.withPage
      ? {
          browserEvaluate: (id: string, code: string): Promise<string> => {
            fake.evaluated.push({ id, code });
            return Promise.resolve(fake.answer);
          },
          browserPress: (id: string, json: string): Promise<void> => {
            fake.pressed.push({ id, json });
            return Promise.resolve();
          },
        }
      : {}),
  }),
}));

const READING = {
  generation: 1,
  end: 2,
  title: 'Shop',
  text: 'Hi',
  textTruncated: false,
  elements: [],
  elementsTruncated: false,
};

beforeEach(() => {
  fake.ready = true;
  fake.withPage = true;
  fake.evaluated.length = 0;
  fake.pressed.length = 0;
  fake.answer = JSON.stringify({ ok: true, reading: READING });
  vi.resetModules();
});

async function pageAccess(): Promise<NativeBrowserPage | undefined> {
  const module = await import('../../modules/health-connect/src/browser-page');
  return module.androidBrowserPage();
}

describe('page access on Android', () => {
  it('reads a page by running the shared script in the browser with that id', async () => {
    const page = await pageAccess();
    const reading = await page?.perform({ id: 'public:1', operation: { kind: 'snapshot' } });
    expect(reading).toEqual(READING);
    expect(fake.evaluated[0]?.id).toBe('public:1');
    expect(fake.evaluated[0]?.code).toContain(BROWSER_PAGE_SCRIPT);
  });

  it('keeps counting refs for the same browser across readings', async () => {
    const page = await pageAccess();
    await page?.perform({ id: 'public:1', operation: { kind: 'snapshot' } });
    await page?.perform({ id: 'public:1', operation: { kind: 'snapshot' } });
    expect(fake.evaluated[0]?.code.endsWith(', 1)')).toBe(true);
    expect(fake.evaluated[1]?.code.endsWith(', 2)')).toBe(true);
  });

  it('clicks and types inside the page script, and presses keys natively', async () => {
    const page = await pageAccess();
    fake.answer = JSON.stringify({ ok: true });
    await page?.perform({ id: 'public:1', operation: { kind: 'click', ref: 'e1' } });
    await page?.perform({
      id: 'public:1',
      operation: { kind: 'type', ref: 'e2', text: 'x', submit: false },
    });
    await page?.perform({ id: 'public:1', operation: { kind: 'keys', keys: 'ctrl+shift+Left' } });
    expect(fake.evaluated.map((entry) => entry.code.includes('"kind":"click"'))).toContain(true);
    expect(fake.evaluated.some((entry) => entry.code.includes('"kind":"type"'))).toBe(true);
    expect(fake.pressed).toEqual([
      { id: 'public:1', json: JSON.stringify({ key: 'ArrowLeft', modifiers: ['ctrl', 'shift'] }) },
    ]);
  });

  it('is not offered when the app build has no page access', async () => {
    fake.withPage = false;
    expect(await pageAccess()).toBeUndefined();
  });
});
