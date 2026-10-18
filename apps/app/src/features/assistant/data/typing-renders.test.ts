import { act, createElement, Fragment, memo, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DraftsModule from './drafts';
import type * as AiDraftsModule from './ai-drafts';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (): Promise<string | null> => Promise.resolve(null),
    setItem: (): Promise<void> => Promise.resolve(),
    removeItem: (): Promise<void> => Promise.resolve(),
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => globalThis.crypto.randomUUID() }));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../api/ai', () => ({ sendAiChatMessage: vi.fn() }));
vi.mock('../../../api/assistant', () => ({
  startAssistantUpload: vi.fn(),
  sendAssistantUploadChunk: vi.fn(),
  finishAssistantUpload: vi.fn(),
}));

const KEY = '00000000-0000-4000-8000-0000000000c1';
const KEYSTROKES = 60;

const renders: Record<string, number> = {};

function useRenderCount(name: string): void {
  useEffect(() => {
    renders[name] = (renders[name] ?? 0) + 1;
  });
}

let drafts: typeof DraftsModule;
let ai: typeof AiDraftsModule;

function Input(): ReactNode {
  useRenderCount('input');
  drafts.useDraft(KEY);
  return null;
}

function Flags(): ReactNode {
  useRenderCount('flags');
  drafts.useDraftSelected(KEY, (text) => text.trim() !== '');
  drafts.useDraftSelected(KEY, (text) => text.length > 240);
  drafts.useDraftSelected(KEY, (text) => text !== '');
  drafts.useDraftReferences(KEY);
  drafts.useQuote(KEY);
  return null;
}

const Chips = memo(function Chips(): ReactNode {
  useRenderCount('chips');
  return null;
});

const Tray = memo(function Tray(): ReactNode {
  useRenderCount('tray');
  return null;
});

function Shell(): ReactNode {
  useRenderCount('shell');
  return createElement(
    Fragment,
    null,
    createElement(Flags),
    createElement(Chips),
    createElement(Tray),
    createElement(Input),
  );
}

function OldShell(): ReactNode {
  useRenderCount('shell');
  drafts.useDraft(KEY);
  drafts.useDraftReferences(KEY);
  return createElement(
    Fragment,
    null,
    createElement(Flags),
    createElement(Chips),
    createElement(Tray),
    createElement(Input),
  );
}

function type(count: number): void {
  for (let index = 1; index <= count; index += 1) {
    act(() => {
      drafts.setDraft(KEY, `message ${String(index)}`);
    });
  }
}

function mount(root: () => ReactNode): void {
  const host = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    host.render(createElement(root));
  });
}

beforeEach(async () => {
  for (const name of Object.keys(renders)) renders[name] = 0;
  vi.resetModules();
  ai = await import('./ai-drafts');
  drafts = await import('./drafts');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    event: undefined,
    document: { activeElement: null, body: null },
    HTMLIFrameElement: Date,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('typing in the composer', () => {
  it('re-renders only the input per keystroke when the shell holds no text', () => {
    mount(Shell);
    const mounted = { ...renders };
    type(KEYSTROKES);

    expect(renders['input']).toBe((mounted['input'] ?? 0) + KEYSTROKES);
    expect(renders['shell']).toBe(mounted['shell']);
    expect(renders['chips']).toBe(mounted['chips']);
    expect(renders['tray']).toBe(mounted['tray']);
    expect((renders['flags'] ?? 0) - (mounted['flags'] ?? 0)).toBeLessThanOrEqual(1);
  });

  it('would re-render the whole shell per keystroke if the shell read the text', () => {
    mount(OldShell);
    const mounted = { ...renders };
    type(KEYSTROKES);

    expect(renders['shell']).toBe((mounted['shell'] ?? 0) + KEYSTROKES);
    expect(renders['flags']).toBeGreaterThan(mounted['flags'] ?? 0);
  });

  it('keeps the references array identical while typing plain text', () => {
    drafts.setDraft(KEY, 'a');
    const first = ai.aiDrafts.get().drafts[KEY]?.references;
    drafts.setDraft(KEY, 'ab');
    drafts.setDraft(KEY, 'abc');
    expect(ai.aiDrafts.get().drafts[KEY]?.references).toBe(first);
  });

  it('clears text and quote in one store update', () => {
    drafts.setDraft(KEY, 'hello');
    drafts.quoteInto(KEY, { who: 'AI', text: 'quoted' });
    const notices = vi.fn();
    const stop = ai.aiDrafts.subscribe(notices);
    drafts.clearDraft(KEY);
    stop();
    expect(notices).toHaveBeenCalledTimes(1);
    expect(drafts.draftText(KEY)).toBe('');
    expect(drafts.draftQuote(KEY)).toBeNull();
  });
});
