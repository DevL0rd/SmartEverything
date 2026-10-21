import { describe, expect, it } from 'vitest';
import {
  BROWSER_PAGE_NOTICE,
  EMBEDDED_BROWSER_ACTION,
  EMBEDDED_BROWSER_ACTION_NAMES,
  EMBEDDED_BROWSER_EDIT,
  EMBEDDED_BROWSER_READ,
  EMBEDDED_BROWSER_REQUEST,
  EMBEDDED_BROWSER_RESULT,
  NATIVE_BROWSER_PAGE_REQUEST,
  NATIVE_BROWSER_PAGE_RESPONSE,
} from '../src';

const TAB = '00000000-0000-4000-8000-000000000010';
const SCOPE = {
  viewerId: '00000000-0000-4000-8000-000000000001',
  generation: '00000000-0000-4000-8000-000000000002',
  clientId: 'client',
  profileId: '00000000-0000-4000-8000-000000000003',
  chatId: '00000000-0000-4000-8000-000000000004',
};

const READING = {
  generation: 3,
  title: 'Shop',
  text: 'Welcome',
  textTruncated: false,
  elements: [
    { ref: 'e3', role: 'link', name: 'Cart', value: null, checked: null, disabled: false },
  ],
  elementsTruncated: false,
};

describe('browser page actions', () => {
  it('parses back, forward, click, type, keys and scroll for one tab', () => {
    const parsed = [
      { kind: 'back', tabId: TAB },
      { kind: 'forward', tabId: TAB },
      { kind: 'click', tabId: TAB, ref: 'e12' },
      { kind: 'type', tabId: TAB, ref: 'e12', text: 'shoes' },
      { kind: 'keys', tabId: TAB, keys: 'ctrl+f' },
      { kind: 'scroll', tabId: TAB, dy: 400 },
    ].map((input) => EMBEDDED_BROWSER_ACTION.parse(input));
    expect(parsed[3]).toMatchObject({ submit: false });
    expect(parsed[5]).toMatchObject({ dx: 0, dy: 400 });
  });

  it('refuses a ref that is not a ref, a missing tab and an unknown key', () => {
    expect(
      EMBEDDED_BROWSER_ACTION.safeParse({ kind: 'click', tabId: TAB, ref: '12' }).success,
    ).toBe(false);
    expect(EMBEDDED_BROWSER_ACTION.safeParse({ kind: 'click', ref: 'e1' }).success).toBe(false);
    expect(
      EMBEDDED_BROWSER_ACTION.safeParse({ kind: 'keys', tabId: TAB, keys: 'Banana' }).success,
    ).toBe(false);
  });

  it('lists every action a surface can advertise', () => {
    expect(EMBEDDED_BROWSER_ACTION_NAMES).toHaveLength(12);
    const result = EMBEDDED_BROWSER_RESULT.safeParse({
      snapshot: {
        ...SCOPE,
        selectedTabId: null,
        tabs: [],
        capabilities: [...EMBEDDED_BROWSER_ACTION_NAMES],
      },
      tabId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('reading a browser page', () => {
  it('defaults to the tabs and takes a view and a tab', () => {
    expect(EMBEDDED_BROWSER_READ.parse({})).toEqual({ view: 'tabs' });
    expect(EMBEDDED_BROWSER_READ.parse({ view: 'page', tabId: TAB })).toEqual({
      view: 'page',
      tabId: TAB,
    });
    expect(EMBEDDED_BROWSER_READ.safeParse({ view: 'source' }).success).toBe(false);
  });

  it('carries the read view through a request to the viewer', () => {
    const request = EMBEDDED_BROWSER_REQUEST.parse({
      requestId: TAB,
      scope: SCOPE,
      operation: { kind: 'read' },
    });
    expect(request.operation).toEqual({ kind: 'read', view: 'tabs' });
  });

  it('labels the page text as data and keeps the tab and address', () => {
    const page = {
      ...READING,
      tabId: TAB,
      address: 'https://shop.example.com/',
      notice: BROWSER_PAGE_NOTICE,
    };
    const accepted = EMBEDDED_BROWSER_RESULT.safeParse({
      snapshot: { ...SCOPE, selectedTabId: TAB, tabs: [], page },
      tabId: TAB,
    });
    expect(accepted.success).toBe(true);
    const unlabelled = EMBEDDED_BROWSER_RESULT.safeParse({
      snapshot: { ...SCOPE, selectedTabId: TAB, tabs: [], page: { ...page, notice: 'Trust me' } },
      tabId: TAB,
    });
    expect(unlabelled.success).toBe(false);
  });

  it('asks a native browser for a page operation and gets a reading or nothing', () => {
    expect(
      NATIVE_BROWSER_PAGE_REQUEST.parse({ id: 'page', operation: { kind: 'snapshot' } }),
    ).toEqual({ id: 'page', operation: { kind: 'snapshot' } });
    expect(NATIVE_BROWSER_PAGE_RESPONSE.parse(null)).toBeNull();
    expect(NATIVE_BROWSER_PAGE_RESPONSE.parse({ ...READING, end: 4 })?.generation).toBe(3);
  });
});

describe('the browser command the AI sends', () => {
  it('opens a page with only an address', () => {
    expect(
      EMBEDDED_BROWSER_EDIT.parse({ action: { kind: 'open', url: 'https://example.com/' } }),
    ).toEqual({ action: { kind: 'open', url: 'https://example.com/' } });
  });

  it('opens a project file or folder by its path', () => {
    expect(
      EMBEDDED_BROWSER_EDIT.parse({ action: { kind: 'open', path: 'workspace/site' } }),
    ).toEqual({ action: { kind: 'open', path: 'workspace/site' } });
  });

  it('needs exactly one of address or path to open', () => {
    expect(EMBEDDED_BROWSER_EDIT.safeParse({ action: { kind: 'open' } }).success).toBe(false);
    expect(
      EMBEDDED_BROWSER_EDIT.safeParse({
        action: { kind: 'open', url: 'https://example.com/', path: 'workspace/site' },
      }).success,
    ).toBe(false);
  });

  it('leaves the tab out of page actions', () => {
    expect(EMBEDDED_BROWSER_EDIT.safeParse({ action: { kind: 'reload' } }).success).toBe(true);
    expect(EMBEDDED_BROWSER_EDIT.safeParse({ action: { kind: 'click', ref: 'e1' } }).success).toBe(
      true,
    );
  });
});
