import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Props {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly contentContainerClassName?: string;
}

function Box({ className, contentContainerClassName, children }: Props): ReactNode {
  return createElement(
    'div',
    { className },
    contentContainerClassName === undefined
      ? children
      : createElement('div', { className: contentContainerClassName }, children),
  );
}

vi.mock('react-native', () => ({ View: Box, Text: Box, ScrollView: Box }));
interface Action {
  readonly label: string;
  readonly selected?: boolean;
}

vi.mock('../../../../components/copy-button', () => ({ copyText: (): void => undefined }));
vi.mock('../../../../components/icon', () => ({ Icon: (): null => null }));
vi.mock('../../../../components/interactive', () => ({
  Interactive: ({ label, selected, className }: Action & Props): ReactNode =>
    createElement('button', { className, 'aria-pressed': selected }, label),
}));
vi.mock('../../../../design/colour', () => ({ useColour: (): string => '#000000' }));
vi.mock('../../../../design/size-class', () => ({
  useSizeClass: (): { readonly width: string } => ({ width: 'compact' }),
}));
vi.mock('../../../../design/visibility', () => ({ useScopeVisible: (): boolean => false }));

const { CodeCard } = await import('./code-card');
const { CHAT_SURFACE } = await import('../chat-surface');

describe('code card', () => {
  it('sits on the shared chat surface with a quiet header and the code below it', () => {
    const markup = renderToStaticMarkup(createElement(CodeCard, { code: 'a: 1', label: 'yaml' }));
    expect(markup).toContain(CHAT_SURFACE);
    expect(markup).not.toContain('bg-surface-2');
    expect(markup).toMatch(/text-caption text-on-surface-faint">yaml</);
    expect(markup).toContain('>Copy yaml</button>');
    expect(markup).toMatch(/class="h-7\.5 flex-row items-center pl-3 pr-1\.5"/);
    expect(markup).toMatch(
      /class="px-3 pb-2\.5"><div class="font-mono text-footnote leading-4\.75"/,
    );
  });

  it('keeps the wrap toggle quiet and compact even when wrapping on a phone', () => {
    const markup = renderToStaticMarkup(createElement(CodeCard, { code: 'a: 1', label: 'yaml' }));
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toMatch(/class="size-7\.5 items-center justify-center"[^>]*>No wrap</);
    expect(markup).not.toContain('bg-primary');
  });
});
