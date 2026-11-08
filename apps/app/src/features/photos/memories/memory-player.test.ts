import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Memory } from '@smarteverything/domain';
import { MemoryPlayer } from './memory-player';

const overlay = vi.hoisted(() => ({ shownHooks: 0 }));

vi.mock('../../../components/overlay', () => ({
  Overlay: ({
    children,
    label,
  }: {
    readonly children: ReactNode;
    readonly label: string;
  }): ReactNode => createElement('dialog', { 'aria-label': label }, children),
  useOverlayShown: (): (() => void) => {
    overlay.shownHooks += 1;
    return (): undefined => undefined;
  },
}));
vi.mock('./use-memory-player', () => ({
  useMemoryPlayer: (): Record<string, unknown> => ({
    position: { index: 0, previous: null, paused: false, ended: false },
    total: 3,
    current: null,
    previous: null,
    progress: { get: (): number => 0, set: (): undefined => undefined },
    step: (): undefined => undefined,
    toggle: (): undefined => undefined,
    hold: (): undefined => undefined,
  }),
}));
vi.mock('./player-stage', () => ({
  PlayerStage: (): null => null,
  PlayerProgress: (): null => null,
}));
vi.mock('./actions', () => ({
  useSaveAsAlbum: (): Record<string, unknown> => ({
    run: (): undefined => undefined,
    busy: false,
    hint: null,
  }),
  useToChat: (): Record<string, unknown> => ({
    run: (): undefined => undefined,
    busy: false,
    hint: null,
  }),
}));
vi.mock('../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../components/icon-button', () => ({
  IconButton: ({ label }: { readonly label: string }): ReactNode =>
    createElement('button', { 'aria-label': label }),
}));
vi.mock('../../nas/data', () => ({ useDriveLink: (): null => null }));

const MEMORY: Memory = {
  id: 'on_this_day:3',
  kind: 'on_this_day',
  yearsAgo: 3,
  from: '2023-11-07',
  to: '2023-11-07',
  count: 3,
  coverItemId: '0b9f8a4e-0000-4000-8000-000000000001',
};

describe('the memory player', () => {
  it('tells the overlay its content is on screen so the overlay stays open', () => {
    const markup = renderToStaticMarkup(
      createElement(MemoryPlayer, { memory: MEMORY, compact: false, onClose: () => undefined }),
    );
    expect(overlay.shownHooks).toBe(1);
    expect(markup).toContain('aria-label="Play 7 November 2023"');
    expect(markup).toContain('1 of 3');
    expect(markup).toContain('Save as album');
  });
});
