import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface ViewProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: ({ children, className }: ViewProps): ReactNode =>
    createElement('div', { className }, children),
}));

vi.mock('./use-push-to-talk', () => ({
  usePushToTalk: (): Readonly<Record<string, unknown>> => ({
    state: 'ready',
    mode: 'hold',
    speaker: null,
    liveLabel: null,
    startedAt: null,
    limitSeconds: null,
    level: 0,
    problem: null,
    onPressIn: (): void => undefined,
    onPressOut: (): void => undefined,
    onPress: (): void => undefined,
  }),
}));

vi.mock('../desktop/use-talk-shortcuts', () => ({ useTalkShortcutLabel: (): null => null }));

vi.mock('./voice-ring', () => ({ VoiceRing: (): null => null }));

vi.mock('../../../components/icon', () => ({ Icon: (): null => null }));

vi.mock('../../../components/interactive', () => ({
  Interactive: ({ children, className }: ViewProps): ReactNode =>
    createElement('button', { className }, children),
}));

const { TalkButton } = await import('./talk-button');

describe('the talk button in a widget action band', () => {
  it('takes the shared control height in the row size', () => {
    const markup = renderToStaticMarkup(createElement(TalkButton, { channelId: 'c', size: 'row' }));
    expect(markup).toContain('size-control-h');
    expect(markup).not.toContain('size-12');
  });
});
